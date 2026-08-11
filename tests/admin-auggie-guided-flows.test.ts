import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  session: {
    sub: "admin" as const,
    iat: 1,
    exp: 9_999_999_999,
    sessionId: "auggie-session",
    accountId: "auggie-account",
    adminName: "Auggie Test Admin",
    role: "central" as "central" | "dojo",
    allowedDojoIds: [] as string[],
    selectedDojoId: "dojo-rsk" as string | null,
  },
}));

vi.mock("../functions/_lib/auth", () => ({
  canAccessDojo: (_session: unknown, dojoId: string) =>
    authState.session.role === "central" &&
    authState.session.selectedDojoId === "dojo-rsk"
      ? true
      : dojoId === authState.session.selectedDojoId,
  effectivePermissionLevel: () =>
    authState.session.role === "central" &&
    authState.session.selectedDojoId === "dojo-rsk"
      ? "renshinkan_super_admin"
      : "dojo_admin",
  getAuthorizedAdminSession: async () => authState.session,
  isRenShinKanSuperAdmin: () =>
    authState.session.role === "central" &&
    authState.session.selectedDojoId === "dojo-rsk",
  isSameOriginRequest: () => true,
  jsonResponse: (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("../functions/_lib/rateLimit", () => ({
  consumeRateLimit: async () => true,
}));

// The reviewed administration endpoints are stood in for, so the tests can
// assert exactly what a guided conversation delegates and how often.
const delegated = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{ route: string; body: Record<string, unknown> }>,
    status: 200,
    body: { ok: true, id: "new-student", studentId: "RSK-2001" } as Record<
      string,
      unknown
    >,
  };
  return {
    state,
    handler: (route: string) =>
      async function onRequest(context: { request: Request }) {
        const contentType = context.request.headers.get("Content-Type") || "";
        const body = contentType.includes("application/json")
          ? ((await context.request.json()) as Record<string, unknown>)
          : Object.fromEntries(
              [...(await context.request.formData()).entries()].map(
                ([key, value]) => [key, String(value)],
              ),
            );
        state.calls.push({ route, body });
        return new Response(JSON.stringify(state.body), {
          status: state.status,
          headers: { "Content-Type": "application/json" },
        });
      },
  };
});

const delegatedState = delegated.state;

vi.mock("../functions/api/admin/students/index", () => ({
  onRequestPost: delegated.handler("admin/students-create"),
}));
vi.mock("../functions/api/admin/students/[id]/hours", () => ({
  onRequestPost: delegated.handler("admin/student-hours"),
}));
vi.mock("../functions/api/admin/students/[id]/exam", () => ({
  onRequestPost: delegated.handler("admin/student-exam"),
}));
vi.mock("../functions/api/admin/newsletters/save", () => ({
  onRequestPost: delegated.handler("admin/newsletter-save"),
}));

const storedNewsletters = vi.hoisted(() => ({ events: [] as unknown[] }));
vi.mock("../functions/_lib/storage", () => ({
  readEditableContentFromStorage: async () => ({
    recentEvents: storedNewsletters.events,
  }),
}));

import {
  confirmAdminAuggieOperation,
  getAdminAuggieFlowSession,
  handleAdminAuggieChat,
  resetAdminAuggieFlowSession,
} from "../functions/_lib/adminAuggie";

type FlowResponse = {
  kind: string;
  heading: string;
  message: string;
  path?: string;
  summary?: Array<{ label: string; value: string }>;
  operation?: {
    id: string;
    confirmationPhrase?: string;
    preview?: Record<string, unknown>;
  };
  flow?: {
    id: string;
    question: string;
    hint?: string;
    optional?: boolean;
    choices?: string[];
    step: number;
    total: number;
    answers?: Array<{ label: string; value: string }>;
    canGoBack?: boolean;
    startedAt: string;
  };
};

type FlowSessionRow = {
  account_id: string;
  session_hash: string;
  selected_dojo_id: string;
  permission_level: string;
  flow_id: string;
  answers_json: string;
  answer_order_json: string;
  started_at: string;
  expires_at: string;
};

class FakeStatement {
  values: unknown[] = [];

  constructor(
    readonly db: FakeDb,
    readonly query: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  first<T>() {
    return Promise.resolve(this.db.first(this) as T | null);
  }

  all<T>() {
    return Promise.resolve({
      success: true as const,
      results: this.db.all(this) as T[],
    });
  }

  async run() {
    return this.db.execute(this);
  }
}

class FakeDb {
  flowSessions = new Map<string, FlowSessionRow>();
  operations = new Map<string, Record<string, unknown>>();
  claims = new Set<string>();
  guards = new Set<string>();
  stateGuards = new Set<string>();
  audits: string[] = [];
  dojos = [{ id: "dojo-rsk", official_name: "RenShinKan", active: 1 }];
  students = [
    {
      id: "student-rsk-1001",
      public_student_id: "RSK-1001",
      display_name: "Test Student",
      dojo_id: "dojo-rsk",
      dojo_name: "RenShinKan",
      current_belt: "6 Kyu",
      active: 1,
      profile_status: "approved",
      public_visible: 1,
      public_visible_before_archive: null,
      archived_at: null,
      deleted_at: null,
      updated_at: "2026-08-04T00:00:00.000Z",
      total_hours: 20,
    },
  ];

  prepare(query: string) {
    return new FakeStatement(this, query.replace(/\s+/g, " ").trim());
  }

  private sessionKey(accountId: string, hash: string, dojoId: string) {
    return `${accountId}|${hash}|${dojoId}`;
  }

  first(statement: FakeStatement) {
    const { query, values } = statement;
    if (query.includes("FROM admin_ai_flow_sessions")) {
      const row = this.flowSessions.get(
        this.sessionKey(String(values[0]), String(values[1]), String(values[2])),
      );
      if (!row) return null;
      if (row.permission_level !== String(values[3])) return null;
      return row.expires_at > String(values[4]) ? row : null;
    }
    if (query.includes("WHERE idempotency_key = ?"))
      return (
        [...this.operations.values()].find(
          (row) => row.idempotency_key === values[0],
        ) || null
      );
    if (query.includes("WHERE undo_of_operation_id = ?")) return null;
    if (query.includes("SELECT * FROM admin_ai_operations WHERE id = ?"))
      return this.operations.get(String(values[0])) || null;
    if (query.includes("AS matches FROM students"))
      return {
        matches: this.students.filter(
          (row) =>
            row.dojo_id === String(values[0]) &&
            !row.deleted_at &&
            row.display_name.toLowerCase() ===
              String(values[1]).toLowerCase(),
        ).length,
      };
    if (query.includes("AS state") && query.includes("FROM dojos d")) {
      const dojo = this.dojos.find((row) => row.id === String(values[1]));
      if (!dojo) return { state: null };
      const matches = this.students.filter(
        (row) =>
          row.dojo_id === dojo.id &&
          !row.deleted_at &&
          row.display_name.toLowerCase() === String(values[0]).toLowerCase(),
      ).length;
      return { state: `${dojo.active}|${matches}` };
    }
    if (query.includes("AS state") && query.includes("FROM students s")) {
      const row = this.students.find((entry) => entry.id === String(values[0]));
      if (!row) return { state: "missing" };
      if (query.includes("printf('%.2f'"))
        return { state: `${row.active}|${row.total_hours.toFixed(2)}` };
      return { state: `${row.current_belt}|${row.active}` };
    }
    return null;
  }

  all(statement: FakeStatement) {
    const { query, values } = statement;
    if (query.includes("SELECT id FROM admin_ai_operations")) return [];
    if (query.includes("FROM dojos WHERE active = 1"))
      return this.dojos
        .filter((row) => row.active === 1)
        .map((row) => ({ id: row.id, official_name: row.official_name }));
    if (query.includes("FROM students s JOIN dojos d")) {
      const ids = values.map(String);
      return this.students
        .filter((row) => ids.includes(row.public_student_id))
        .map((row) => ({ ...row }));
    }
    return [];
  }

  execute(statement: FakeStatement) {
    const { query, values } = statement;
    if (query.startsWith("INSERT INTO admin_ai_flow_sessions")) {
      const key = this.sessionKey(
        String(values[1]),
        String(values[2]),
        String(values[3]),
      );
      this.flowSessions.set(key, {
        account_id: String(values[1]),
        session_hash: String(values[2]),
        selected_dojo_id: String(values[3]),
        permission_level: String(values[4]),
        flow_id: String(values[5]),
        answers_json: String(values[6]),
        answer_order_json: String(values[7]),
        started_at: String(values[8]),
        expires_at: String(values[9]),
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("DELETE FROM admin_ai_flow_sessions")) {
      if (query.includes("expires_at <= ?")) {
        const now = String(values[0]);
        for (const [key, row] of [...this.flowSessions])
          if (row.expires_at <= now) this.flowSessions.delete(key);
        return { success: true, meta: { changes: 1 } };
      }
      if (query.includes("selected_dojo_id = ?")) {
        this.flowSessions.delete(
          this.sessionKey(
            String(values[0]),
            String(values[1]),
            String(values[2]),
          ),
        );
        return { success: true, meta: { changes: 1 } };
      }
      for (const [key, row] of [...this.flowSessions])
        if (
          row.account_id === String(values[0]) &&
          row.session_hash === String(values[1])
        )
          this.flowSessions.delete(key);
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("INSERT INTO audit_log")) {
      this.audits.push(String(values[0]));
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("INSERT INTO admin_ai_operations")) {
      if (
        [...this.operations.values()].some(
          (row) => row.idempotency_key === values[1],
        )
      )
        throw new Error("UNIQUE constraint failed: idempotency_key");
      this.operations.set(String(values[0]), {
        id: values[0],
        idempotency_key: values[1],
        account_id: values[2],
        session_hash: values[3],
        selected_dojo_id: values[4],
        permission_level: values[5],
        tool_name: values[6],
        execution_mode: values[7],
        status: values[8],
        normalized_args_json: values[9],
        args_sha256: values[10],
        preview_json: values[11],
        fingerprints_json: values[12],
        confirmation_sha256: values[13],
        request_id: values[14],
        undo_of_operation_id: values[15],
        expires_at: values[16],
        payload_expires_at: values[17],
        payload_scrubbed_at: null,
        undo_expires_at: null,
        result_json: null,
        result_fingerprints_json: null,
        error_code: null,
        confirmed_at: null,
        completed_at: null,
        created_at: values[18],
        updated_at: values[19],
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("INSERT INTO admin_ai_execution_claims")) {
      const id = String(values[0]);
      if (this.claims.has(id)) throw new Error("UNIQUE constraint failed");
      this.claims.add(id);
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("INSERT INTO admin_ai_operation_state_guards")) {
      const row = this.operations.get(String(values[0]));
      const observed = row
        ? `${row.status}|${String(row.expires_at) > new Date().toISOString() ? 1 : 0}|${row.payload_scrubbed_at ? 0 : 1}`
        : "missing";
      if (observed !== "prepared|1|1")
        throw new Error(
          "CHECK constraint failed: admin_ai_operation_state_matches",
        );
      this.stateGuards.add(String(values[0]));
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("INSERT INTO admin_ai_execution_guards")) {
      const operationId = String(values[0]);
      if (query.includes("'__operation__'")) {
        const row = this.operations.get(operationId);
        const observed = row
          ? `${row.status}|${String(row.expires_at) > String(values[1]) ? 1 : 0}`
          : "missing";
        if (observed !== "prepared|1")
          throw new Error("CHECK constraint failed: execution guard");
        this.guards.add(`${operationId}:__operation__`);
        return { success: true, meta: { changes: 1 } };
      }
      const targetId = String(values[1]);
      const expected = String(values[2]);
      const probe = this.prepare(query.slice(query.indexOf("SELECT")));
      probe.values = values.slice(3);
      const observed =
        (this.first(probe) as { state?: string } | null)?.state ?? "missing";
      if (expected !== observed)
        throw new Error("CHECK constraint failed: execution guard");
      this.guards.add(`${operationId}:${targetId}`);
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("UPDATE admin_ai_operations SET status = 'succeeded'")) {
      const row = this.operations.get(String(values[7]));
      if (row && row.status === "prepared")
        Object.assign(row, {
          status: "succeeded",
          confirmed_at: values[0],
          completed_at: values[1],
          result_json: values[2],
        });
      return { success: true, meta: { changes: 1 } };
    }
    return { success: true, meta: { changes: 1 } };
  }

  async batch(statements: FakeStatement[]) {
    const flowSessions = new Map(this.flowSessions);
    const operations = new Map(
      [...this.operations].map(([id, row]) => [id, { ...row }]),
    );
    const claims = new Set(this.claims);
    const guards = new Set(this.guards);
    const stateGuards = new Set(this.stateGuards);
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    } catch (error) {
      this.flowSessions = flowSessions;
      this.operations = operations;
      this.claims = claims;
      this.guards = guards;
      this.stateGuards = stateGuards;
      throw error;
    }
  }
}

function tool(name: string, args: Record<string, unknown>) {
  return {
    tool_calls: [
      { type: "function", function: { name, arguments: JSON.stringify(args) } },
    ],
  };
}

function chat(message: string, locale: "en" | "th" = "en") {
  return new Request("https://example.test/api/admin/auggie/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": crypto.randomUUID(),
    },
    body: JSON.stringify({ message, locale, currentPath: "/admin/students" }),
  });
}

function plainRequest() {
  return new Request("https://example.test/api/admin/auggie/session", {
    method: "GET",
    headers: { "X-Request-ID": crypto.randomUUID() },
  });
}

function env(db: FakeDb, run: ReturnType<typeof vi.fn>) {
  return {
    STUDENT_DB: db,
    SESSION_SECRET: "a".repeat(48),
    CONTENT_KV: {},
    AI: { run },
  } as never;
}

function flowStarter(flow: string) {
  return vi.fn(async () => tool("start_guided_flow", { flow }));
}

// Runs a whole guided conversation: the model is asked once to name the flow,
// then every answer is handled by the server alone.
async function walk(
  db: FakeDb,
  run: ReturnType<typeof vi.fn>,
  opening: string,
  answers: string[],
  locale: "en" | "th" = "en",
) {
  const seen: FlowResponse[] = [];
  seen.push(
    (await handleAdminAuggieChat(
      chat(opening, locale),
      env(db, run),
    )) as FlowResponse,
  );
  for (const answer of answers)
    seen.push(
      (await handleAdminAuggieChat(
        chat(answer, locale),
        env(db, run),
      )) as FlowResponse,
    );
  return seen;
}

beforeEach(() => {
  authState.session = {
    sub: "admin",
    iat: 1,
    exp: 9_999_999_999,
    sessionId: "auggie-session",
    accountId: "auggie-account",
    adminName: "Auggie Test Admin",
    role: "central",
    allowedDojoIds: [],
    selectedDojoId: "dojo-rsk",
  };
  delegatedState.calls.length = 0;
  delegatedState.status = 200;
  delegatedState.body = {
    ok: true,
    id: "new-student",
    studentId: "RSK-2001",
  };
  storedNewsletters.events = [];
});

describe("Admin Auggie guided conversations", () => {
  it("asks for a new student profile one question at a time and says how many there are", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    const steps = await walk(db, run, "make a new student profile", [
      "John Smith",
    ]);

    expect(steps[0].kind).toBe("flow");
    expect(steps[0].message).toContain("Happy to help");
    // The one dojo this administrator can use is filled in by the server, so it
    // is never asked about.
    expect(steps[0].flow?.total).toBe(5);
    expect(steps[0].message).toContain("about 5 short questions");
    expect(steps[0].flow?.step).toBe(1);
    expect(steps[0].flow?.question).toContain("name in English");
    expect(steps[0].flow?.answers).toEqual([]);

    expect(steps[1].flow?.step).toBe(2);
    expect(steps[1].flow?.question).toContain("name in Thai");
    expect(steps[1].flow?.optional).toBe(true);
    expect(steps[1].flow?.answers).toEqual([
      { label: "Name in English", value: "John Smith" },
    ]);
  });

  it("never sends anything to AI once the conversation has started", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    await walk(db, run, "make a new student profile", [
      "John Smith",
      "สมชาย",
      "Unranked",
      "15/01/2026",
      "skip",
    ]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("reaches a summary that needs the exact phrase, and creates nothing before it", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    const steps = await walk(db, run, "make a new student profile", [
      "John Smith",
      "สมชาย",
      "Unranked",
      "15/01/2026",
      "skip",
    ]);
    const final = steps[steps.length - 1];

    expect(final.kind).toBe("proposal");
    expect(final.operation?.confirmationPhrase).toBe("CREATE STUDENT");
    expect(final.message).toContain("CREATE STUDENT");
    expect(final.summary).toEqual([
      { label: "Name in English", value: "John Smith" },
      { label: "Name in Thai", value: "สมชาย" },
      { label: "Rank", value: "Unranked" },
      { label: "Joined the dojo", value: "2026-01-15" },
      { label: "Starting training hours", value: "not given" },
    ]);
    expect(delegatedState.calls).toHaveLength(0);
    expect(db.flowSessions.size).toBe(0);
  });

  it("creates the student only after the exact phrase, through the reviewed endpoint", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    const steps = await walk(db, run, "make a new student profile", [
      "John Smith",
      "skip",
      "Unranked",
      "skip",
      "skip",
    ]);
    const operationId = steps[steps.length - 1].operation!.id;

    await expect(
      confirmAdminAuggieOperation(
        new Request("https://example.test/api/admin/auggie/confirm", {
          method: "POST",
          headers: { "X-Request-ID": crypto.randomUUID() },
        }),
        env(db, run),
        operationId,
        "WRONG PHRASE",
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_CONFIRMATION_MISMATCH" });
    expect(delegatedState.calls).toHaveLength(0);

    const result = (await confirmAdminAuggieOperation(
      new Request("https://example.test/api/admin/auggie/confirm", {
        method: "POST",
        headers: { "X-Request-ID": crypto.randomUUID() },
      }),
      env(db, run),
      operationId,
      "CREATE STUDENT",
      "en",
    )) as { records?: Array<{ studentId?: string }> };

    expect(delegatedState.calls).toHaveLength(1);
    expect(delegatedState.calls[0].route).toBe("admin/students-create");
    expect(delegatedState.calls[0].body).toMatchObject({
      displayName: "John Smith",
      currentBelt: "Unranked",
      dojoId: "dojo-rsk",
      manualStudentId: false,
    });
    // The reviewed endpoint allocates the Student ID, never Auggie.
    expect(delegatedState.calls[0].body).not.toHaveProperty("studentId");
    expect(result.records?.[0]?.studentId).toBe("RSK-2001");
  });

  it("cancels halfway, says so, and keeps nothing", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    const steps = await walk(db, run, "make a new student profile", [
      "John Smith",
      "cancel",
    ]);
    const final = steps[steps.length - 1];

    expect(final.kind).toBe("result");
    expect(final.heading).toBe("Cancelled");
    expect(final.message).toContain("Nothing was saved");
    expect(db.flowSessions.size).toBe(0);
    expect(db.operations.size).toBe(0);
    expect(delegatedState.calls).toHaveLength(0);
  });

  it("cancels in Thai as well", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    const steps = await walk(
      db,
      run,
      "สร้างประวัตินักเรียนใหม่",
      ["John Smith", "ยกเลิก"],
      "th",
    );
    expect(steps[0].flow?.question).toContain("ภาษาอังกฤษ");
    expect(steps[steps.length - 1].heading).toBe("ยกเลิกแล้ว");
    expect(db.flowSessions.size).toBe(0);
  });

  it("goes back to change the last answer", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    const steps = await walk(db, run, "make a new student profile", [
      "John Smith",
      "back",
      "Jane Brown",
    ]);

    expect(steps[2].message).toContain("Let us change that one");
    expect(steps[2].flow?.step).toBe(1);
    expect(steps[2].flow?.question).toContain("name in English");
    expect(steps[3].flow?.answers).toEqual([
      { label: "Name in English", value: "Jane Brown" },
    ]);
  });

  it("says there is nothing to go back to on the first question", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    const steps = await walk(db, run, "make a new student profile", ["back"]);
    expect(steps[1].message).toContain("nothing to go back to");
    expect(steps[1].flow?.step).toBe(1);
  });

  it("answers a bad rank and a bad date kindly and asks again", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    const steps = await walk(db, run, "make a new student profile", [
      "John Smith",
      "skip",
      "Purple Belt",
      "1 Kyu",
      "not a date",
    ]);

    expect(steps[3].message).toContain("I do not know that rank");
    expect(steps[3].flow?.step).toBe(3);
    expect(steps[4].flow?.step).toBe(4);
    expect(steps[5].message).toContain("does not look right");
    expect(steps[5].flow?.step).toBe(4);
  });

  it("refuses to skip a question that is needed", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    const steps = await walk(db, run, "make a new student profile", ["skip"]);
    expect(steps[1].message).toContain("I do need this one");
    expect(steps[1].flow?.step).toBe(1);
  });

  it("takes several answers at once on separate lines", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    const steps = await walk(db, run, "make a new student profile", [
      "John Smith\nสมชาย\n1 Kyu",
    ]);
    expect(steps[1].flow?.step).toBe(4);
    expect(steps[1].flow?.answers).toEqual([
      { label: "Name in English", value: "John Smith" },
      { label: "Name in Thai", value: "สมชาย" },
      { label: "Rank", value: "1 Kyu" },
    ]);
  });

  it("keeps a name containing a comma as one answer", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    const steps = await walk(db, run, "make a new student profile", [
      "Smith, John",
    ]);
    expect(steps[1].flow?.answers).toEqual([
      { label: "Name in English", value: "Smith, John" },
    ]);
  });

  it("asks which dojo only when more than one is possible", async () => {
    const db = new FakeDb();
    db.dojos = [
      { id: "dojo-rsk", official_name: "RenShinKan", active: 1 },
      { id: "dojo-cmu", official_name: "Chiang Mai University", active: 1 },
    ];
    const run = flowStarter("create_student");
    const steps = await walk(db, run, "make a new student profile", [
      "John Smith",
      "skip",
      "Chiang Mai University",
    ]);
    expect(steps[0].flow?.total).toBe(6);
    expect(steps[2].flow?.question).toContain("Which dojo");
    expect(steps[2].flow?.choices).toEqual([
      "RenShinKan",
      "Chiang Mai University",
    ]);
    expect(steps[3].flow?.answers?.at(-1)).toEqual({
      label: "Dojo",
      value: "Chiang Mai University",
    });
  });

  it("carries on from the same question when the panel is closed and opened again", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    await walk(db, run, "make a new student profile", ["John Smith", "สมชาย"]);

    const reopened = (await getAdminAuggieFlowSession(
      plainRequest(),
      env(db, run),
      "en",
      "/admin/students",
    )) as { response: FlowResponse | null };

    expect(reopened.response?.kind).toBe("flow");
    expect(reopened.response?.message).toContain("Welcome back");
    expect(reopened.response?.flow?.step).toBe(3);
    expect(reopened.response?.flow?.answers).toEqual([
      { label: "Name in English", value: "John Smith" },
      { label: "Name in Thai", value: "สมชาย" },
    ]);
    // Reopening never asks the model anything.
    expect(run).toHaveBeenCalledTimes(1);

    // And the next answer continues the same conversation.
    const next = (await handleAdminAuggieChat(
      chat("1 Kyu"),
      env(db, run),
    )) as FlowResponse;
    expect(next.flow?.step).toBe(4);
  });

  it("tells the panel how long ago the conversation was started", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    const steps = await walk(db, run, "make a new student profile", []);
    expect(Date.parse(steps[0].flow!.startedAt)).toBeLessThanOrEqual(Date.now());
  });

  it("start over clears the saved answers", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    await walk(db, run, "make a new student profile", ["John Smith"]);
    expect(db.flowSessions.size).toBe(1);

    const cleared = await resetAdminAuggieFlowSession(
      plainRequest(),
      env(db, run),
      "en",
      "/admin/students",
    );
    expect(cleared.cleared).toBe(true);
    expect(db.flowSessions.size).toBe(0);

    const after = (await getAdminAuggieFlowSession(
      plainRequest(),
      env(db, run),
      "en",
      "/admin/students",
    )) as { response: FlowResponse | null };
    expect(after.response).toBeNull();
  });

  it("drops a conversation that has been left too long", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    await walk(db, run, "make a new student profile", ["John Smith"]);
    for (const row of db.flowSessions.values())
      row.expires_at = "2020-01-01T00:00:00.000Z";

    const after = (await getAdminAuggieFlowSession(
      plainRequest(),
      env(db, run),
      "en",
      "/admin/students",
    )) as { response: FlowResponse | null };
    expect(after.response).toBeNull();
    expect(db.flowSessions.size).toBe(0);
  });

  it("never shows one administrator's work in progress to another", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    await walk(db, run, "make a new student profile", ["John Smith"]);
    expect(db.flowSessions.size).toBe(1);

    authState.session.accountId = "other-account";
    authState.session.sessionId = "other-session";
    const other = (await getAdminAuggieFlowSession(
      plainRequest(),
      env(db, run),
      "en",
      "/admin/students",
    )) as { response: FlowResponse | null };
    expect(other.response).toBeNull();
    expect(db.flowSessions.size).toBe(1);
  });

  it("keeps private details out and points to the normal administration page", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_student");
    const steps = await walk(db, run, "make a new student profile", [
      "passport number: AB1234567",
    ]);
    expect(steps[1].message).toContain("private detail");
    expect(steps[1].path).toBe("/admin/students");
    expect(steps[1].flow?.step).toBe(1);
    const saved = [...db.flowSessions.values()][0];
    expect(saved.answers_json).not.toContain("AB1234567");
  });

  it("cannot start a guided conversation outside the administrator's access", async () => {
    authState.session.role = "dojo";
    authState.session.selectedDojoId = "dojo-cmu";
    authState.session.allowedDojoIds = ["dojo-cmu"];
    const db = new FakeDb();
    const run = flowStarter("create_newsletter");
    await expect(
      handleAdminAuggieChat(chat("write a newsletter"), env(db, run)),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_ROUTE_FORBIDDEN" });
    expect(db.flowSessions.size).toBe(0);
  });

  it("refuses a flow name the model was never offered", async () => {
    const db = new FakeDb();
    const run = vi.fn(async () =>
      tool("start_guided_flow", { flow: "delete_everything" }),
    );
    await expect(
      handleAdminAuggieChat(chat("do a thing"), env(db, run)),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_MALFORMED_TOOL" });
    expect(db.flowSessions.size).toBe(0);
  });
});

describe("Admin Auggie guided training hours and examinations", () => {
  it("walks through adding training hours and checks the Student ID", async () => {
    const db = new FakeDb();
    const run = flowStarter("add_training_hours");
    const steps = await walk(db, run, "add training hours", [
      "not-an-id",
      "RSK-1001",
      "3",
      "2026-08-10",
      "Chiang Mai",
    ]);

    expect(steps[1].message).toContain("does not look like a Student ID");
    expect(steps[2].flow?.step).toBe(2);
    const final = steps[steps.length - 1];
    expect(final.kind).toBe("proposal");
    expect(final.operation?.confirmationPhrase).toBe(
      "ADD 3 HOURS RSK-1001 2026-08-10",
    );
    expect(delegatedState.calls).toHaveLength(0);
  });

  it("walks through an examination result and refuses a rank that is not higher", async () => {
    const db = new FakeDb();
    const run = flowStarter("record_exam_result");
    const steps = await walk(db, run, "record an exam result", [
      "RSK-1001",
      "5 Kyu",
      "yes",
      "14/12/2025",
      "Bangkok",
    ]);
    const final = steps[steps.length - 1];
    expect(final.kind).toBe("proposal");
    expect(final.operation?.confirmationPhrase).toBe(
      "RECORD PASSED EXAM RSK-1001",
    );

    // A rank at or below the student's own rank is caught as soon as it is
    // given, not left until the summary.
    const second = new FakeDb();
    const runAgain = flowStarter("record_exam_result");
    const retry = await walk(second, runAgain, "record an exam result", [
      "RSK-1001",
      "9 Kyu",
      "3 Kyu",
      "no",
      "14/12/2025",
      "Bangkok",
    ]);
    expect(retry[2].message).toContain("already at 6 Kyu");
    expect(retry[2].flow?.step).toBe(2);
    const finished = retry[retry.length - 1];
    expect(finished.kind).toBe("proposal");
    expect(finished.operation?.confirmationPhrase).toBe(
      "RECORD FAILED EXAM RSK-1001",
    );
    expect(delegatedState.calls).toHaveLength(0);
  });

  it("checks a Student ID against the records as soon as it is given", async () => {
    const db = new FakeDb();
    const run = flowStarter("add_training_hours");
    const steps = await walk(db, run, "add training hours", ["RSK-9999"]);
    expect(steps[1].message).toContain("could not find that Student ID");
    expect(steps[1].flow?.step).toBe(1);
  });
});

describe("Admin Auggie guided newsletter", () => {
  it("prepares an unpublished draft that reaches nobody until it is confirmed", async () => {
    const db = new FakeDb();
    const run = flowStarter("create_newsletter");
    const steps = await walk(db, run, "write a newsletter", [
      "Summer Training Camp",
      "A short note about the camp.",
      "We are running a camp in August. Everybody is welcome.",
      "Events",
      "05/08/2026",
      "skip",
    ]);
    const final = steps[steps.length - 1];

    expect(final.kind).toBe("proposal");
    expect(final.operation?.confirmationPhrase).toBe("CREATE NEWSLETTER");
    expect(final.operation?.preview?.webAddress).toBe("summer-training-camp");
    expect(delegatedState.calls).toHaveLength(0);

    const result = (await confirmAdminAuggieOperation(
      new Request("https://example.test/api/admin/auggie/confirm", {
        method: "POST",
        headers: { "X-Request-ID": crypto.randomUUID() },
      }),
      env(db, run),
      final.operation!.id,
      "CREATE NEWSLETTER",
      "en",
    )) as { ok?: boolean };

    expect(result.ok).toBe(true);
    expect(delegatedState.calls).toHaveLength(1);
    expect(delegatedState.calls[0].route).toBe("admin/newsletter-save");
    const saved = JSON.parse(
      String(delegatedState.calls[0].body.event),
    ) as Record<string, unknown>;
    expect(saved.published).toBe(false);
    expect(saved.notifySubscribers).toBe(false);
    expect(saved.lifecycleStatus).toBe("active");
    expect(saved.slug).toBe("summer-training-camp");
    expect(saved.category).toBe("Events");
  });

  it("says so kindly when the web address is already taken, and takes another", async () => {
    const db = new FakeDb();
    storedNewsletters.events = [
      { id: "existing", slug: "summer-training-camp", slugHistory: [] },
    ];
    const run = flowStarter("create_newsletter");
    const steps = await walk(db, run, "write a newsletter", [
      "Summer Training Camp",
      "A short note about the camp.",
      "We are running a camp in August.",
      "Events",
      "05/08/2026",
      // Skipping makes the server derive summer-training-camp, which is taken.
      "skip",
      "summer-camp-2026",
    ]);

    expect(steps[6].message).toContain("already uses the web address");
    expect(steps[6].flow?.step).toBe(6);
    const final = steps[steps.length - 1];
    expect(final.kind).toBe("proposal");
    expect(final.operation?.preview?.webAddress).toBe("summer-camp-2026");
    expect(delegatedState.calls).toHaveLength(0);
  });
});
