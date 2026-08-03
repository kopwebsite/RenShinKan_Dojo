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

import {
  AdminAuggieError,
  confirmAdminAuggieOperation,
  detectSensitiveAdminAuggieInput,
  handleAdminAuggieChat,
  parseBoundedJson,
  prepareAdminAuggieUndo,
  scrubExpiredAdminAuggiePayloads,
} from "../functions/_lib/adminAuggie";

type FakeStudent = {
  id: string;
  public_student_id: string;
  display_name: string;
  dojo_id: string;
  dojo_name: string;
  current_belt: string;
  active: number;
  profile_status: string;
  public_visible: number;
  public_visible_before_archive: number | null;
  archived_at: string | null;
  deleted_at: string | null;
  updated_at: string;
  total_hours: number;
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
  students = new Map<string, FakeStudent>();
  operations = new Map<string, Record<string, unknown>>();
  claims = new Set<string>();
  guards = new Set<string>();
  stateGuards = new Set<string>();
  audits: unknown[][] = [];
  archiveWrites = 0;
  restoreWrites = 0;
  batches: string[][] = [];
  batchBindingCounts: number[][] = [];
  resolveHook?: () => void;
  beforeBatch?: () => void;
  contributionPeriodExists = false;
  contributionSnapshots = new Set<string>();
  currentBangkokMonthOverride?: string;

  prepare(query: string) {
    return new FakeStatement(this, query.replace(/\s+/g, " ").trim());
  }

  first(statement: FakeStatement) {
    const { query, values } = statement;
    if (query.includes("WHERE idempotency_key = ?")) {
      return (
        [...this.operations.values()].find(
          (row) => row.idempotency_key === values[0],
        ) || null
      );
    }
    if (query.includes("WHERE undo_of_operation_id = ?")) {
      return (
        [...this.operations.values()].find(
          (row) =>
            row.undo_of_operation_id === values[0] &&
            (row.status === "prepared" || row.status === "succeeded"),
        ) || null
      );
    }
    if (query.includes("SELECT * FROM admin_ai_operations WHERE id = ?"))
      return this.operations.get(String(values[0])) || null;
    if (query.includes("FROM contribution_periods"))
      return this.contributionPeriodExists
        ? { month_key: String(values[0]) }
        : null;
    return null;
  }

  all(statement: FakeStatement) {
    const { query, values } = statement;
    if (query.includes("SELECT id FROM admin_ai_operations")) {
      const now = String(values[0]);
      return [...this.operations.values()]
        .filter(
          (row) =>
            !row.payload_scrubbed_at &&
            String(row.payload_expires_at) <= now &&
            (row.status !== "prepared" || String(row.expires_at) <= now),
        )
        .slice(0, Number(values[2]))
        .map((row) => ({ id: row.id }));
    }
    if (
      query.includes("FROM students s JOIN dojos d") &&
      query.includes("public_student_id IN")
    ) {
      this.resolveHook?.();
      this.resolveHook = undefined;
      const scoped = query.includes("AND s.dojo_id = ?");
      const dojoId = scoped ? String(values[values.length - 1]) : null;
      const ids = (scoped ? values.slice(0, -1) : values).map(String);
      return [...this.students.values()]
        .filter((student) => ids.includes(student.public_student_id))
        .filter((student) => !dojoId || student.dojo_id === dojoId)
        .map((student) => ({ ...student }));
    }
    if (query.includes("FROM contribution_period_students"))
      return values
        .slice(1)
        .map(String)
        .filter((studentId) => this.contributionSnapshots.has(studentId))
        .map((studentId) => ({ student_id: studentId }));
    return [];
  }

  fingerprint(student: FakeStudent) {
    return [
      student.active,
      student.archived_at || "",
      student.deleted_at || "",
      student.updated_at,
      student.public_visible,
      student.public_visible_before_archive == null
        ? ""
        : student.public_visible_before_archive,
      student.profile_status,
    ].join("|");
  }

  execute(statement: FakeStatement) {
    const { query, values } = statement;
    if (query.startsWith("INSERT INTO audit_log")) {
      this.audits.push([...values]);
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("INSERT INTO admin_ai_operations")) {
      if (
        [...this.operations.values()].some(
          (row) => row.idempotency_key === values[1],
        )
      )
        throw new Error(
          "UNIQUE constraint failed: admin_ai_operations.idempotency_key",
        );
      const row: Record<string, unknown> = {
        id: values[0],
        idempotency_key: values[1],
        account_id: values[2],
        session_hash: values[3],
        selected_dojo_id: values[4],
        permission_level: values[5],
        tool_name: values[6],
        tool_version: 1,
        execution_mode: values[7],
        status: values[8],
        normalized_args_json: values[9],
        args_sha256: values[10],
        preview_json: values[11],
        fingerprints_json: values[12],
        result_fingerprints_json: null,
        confirmation_sha256: values[13],
        request_id: values[14],
        undo_of_operation_id: values[15],
        undone_by_operation_id: null,
        expires_at: values[16],
        undo_expires_at: null,
        confirmed_at: null,
        completed_at: null,
        result_json: null,
        error_code: null,
        payload_expires_at: values[17],
        payload_scrubbed_at: null,
        created_at: values[18],
        updated_at: values[19],
      };
      if (
        row.undo_of_operation_id &&
        [...this.operations.values()].some(
          (existing) =>
            existing.undo_of_operation_id === row.undo_of_operation_id &&
            (existing.status === "prepared" || existing.status === "succeeded"),
        )
      )
        throw new Error("UNIQUE constraint failed: active undo");
      this.operations.set(String(row.id), row);
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("INSERT INTO admin_ai_execution_claims")) {
      const id = String(values[0]);
      if (this.claims.has(id))
        throw new Error("UNIQUE constraint failed: execution claim");
      this.claims.add(id);
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("INSERT INTO admin_ai_operation_state_guards")) {
      const operationId = String(values[0]);
      const guardName = query.includes("'undo_parent'")
        ? "undo_parent"
        : query.includes("'contribution_month'")
          ? "contribution_month"
          : "confirmability";
      const key = `${operationId}:${guardName}`;
      if (this.stateGuards.has(key))
        throw new Error("UNIQUE constraint failed: operation state guard");
      const child = this.operations.get(operationId);
      const observed =
        guardName === "confirmability"
          ? child
            ? `${child.status}|${String(child.expires_at) > new Date().toISOString() ? 1 : 0}|${child.payload_scrubbed_at ? 0 : 1}`
            : "missing"
          : guardName === "undo_parent"
            ? (() => {
                const parent = this.operations.get(String(values[1]));
                return parent
                  ? `${parent.status}|${String(parent.undone_by_operation_id || "")}|${String(parent.undo_expires_at) > new Date().toISOString() ? 1 : 0}|${parent.payload_scrubbed_at ? 0 : 1}`
                  : "missing";
              })()
            : this.currentBangkokMonthOverride || String(values[1]);
      const expected =
        guardName === "confirmability"
          ? "prepared|1|1"
          : guardName === "undo_parent"
            ? "succeeded||1|1"
            : String(values[1]);
      if (observed !== expected)
        throw new Error(
          "CHECK constraint failed: admin_ai_operation_state_matches",
        );
      this.stateGuards.add(key);
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("INSERT INTO admin_ai_execution_guards")) {
      const operationId = String(values[0]);
      let targetId: string;
      let expected: string;
      let observed: string;
      if (query.includes("'__operation__'")) {
        targetId = "__operation__";
        expected = "prepared|1";
        const row = this.operations.get(operationId);
        observed = row
          ? `${row.status}|${String(row.expires_at) > String(values[1]) ? 1 : 0}`
          : "missing";
      } else if (query.includes("'__failure__'")) {
        targetId = "__failure__";
        expected = "prepared";
        observed = String(
          this.operations.get(operationId)?.status || "missing",
        );
      } else if (query.includes("'__expiry__'")) {
        targetId = "__expiry__";
        expected = "prepared|0";
        const row = this.operations.get(operationId);
        observed = row
          ? `${row.status}|${String(row.expires_at) > String(values[1]) ? 1 : 0}`
          : "missing";
      } else if (query.includes("'__contribution_period__'")) {
        targetId = "__contribution_period__";
        expected = "absent";
        observed = "absent";
      } else {
        targetId = String(values[1]);
        expected = String(values[2]);
        observed = this.students.has(targetId)
          ? this.fingerprint(this.students.get(targetId)!)
          : "missing";
      }
      const key = `${operationId}:${targetId}`;
      if (this.guards.has(key))
        throw new Error("UNIQUE constraint failed: execution guard");
      if (expected !== observed)
        throw new Error("CHECK constraint failed: execution guard");
      this.guards.add(key);
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("UPDATE students SET active = 0")) {
      const student = this.students.get(String(values[3]))!;
      student.public_visible_before_archive = student.public_visible;
      student.public_visible = 0;
      student.active = 0;
      student.archived_at = String(values[0]);
      student.updated_at = String(values[2]);
      this.archiveWrites += 1;
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("UPDATE students SET active = 1")) {
      const student = this.students.get(String(values[2]))!;
      student.active = 1;
      student.public_visible = Number(values[0]);
      student.archived_at = null;
      student.updated_at = String(values[1]);
      this.restoreWrites += 1;
      return { success: true, meta: { changes: 1 } };
    }
    if (
      query.startsWith("UPDATE admin_ai_operations SET status = 'succeeded'")
    ) {
      const row = this.operations.get(String(values[7]))!;
      if (row.status !== "prepared")
        return { success: true, meta: { changes: 0 } };
      Object.assign(row, {
        status: "succeeded",
        confirmed_at: values[0],
        completed_at: values[1],
        result_json: values[2],
        result_fingerprints_json: values[3],
        undo_expires_at: values[4],
        payload_expires_at: values[5],
        error_code: null,
        updated_at: values[6],
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("UPDATE admin_ai_operations SET status = 'failed'")) {
      const row = this.operations.get(String(values[3]))!;
      if (row.status === "prepared")
        Object.assign(row, {
          status: "failed",
          error_code: values[0],
          payload_expires_at: values[1],
        });
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("UPDATE admin_ai_operations SET status = 'expired'")) {
      const row = this.operations.get(String(values[2]))!;
      if (row.status === "prepared")
        Object.assign(row, {
          status: "expired",
          payload_expires_at: values[0],
        });
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("UPDATE admin_ai_operations SET status = 'undone'")) {
      const row = this.operations.get(String(values[3]))!;
      if (row.status === "succeeded")
        Object.assign(row, {
          status: "undone",
          undone_by_operation_id: values[0],
          payload_expires_at: values[1],
        });
      return { success: true, meta: { changes: 1 } };
    }
    if (
      query.startsWith("UPDATE admin_ai_operations SET normalized_args_json")
    ) {
      const now = String(values[0]);
      let changes = 0;
      for (const id of values.slice(2, -2).map(String)) {
        const row = this.operations.get(id);
        if (
          !row ||
          row.payload_scrubbed_at ||
          String(row.payload_expires_at) > String(values.at(-2)) ||
          (row.status === "prepared" &&
            String(row.expires_at) > String(values.at(-1)))
        )
          continue;
        Object.assign(row, {
          normalized_args_json: '{"scrubbed":true}',
          args_sha256: "scrubbed",
          preview_json: "{}",
          fingerprints_json: "{}",
          result_fingerprints_json: null,
          confirmation_sha256: null,
          result_json: null,
          payload_scrubbed_at: now,
          updated_at: now,
        });
        changes += 1;
      }
      return { success: true, meta: { changes } };
    }
    if (query.startsWith("DELETE FROM admin_ai_execution_guards")) {
      const scrubbedAt = String(values.at(-1));
      const ids = new Set(
        values
          .slice(0, -1)
          .map(String)
          .filter(
            (id) => this.operations.get(id)?.payload_scrubbed_at === scrubbedAt,
          ),
      );
      this.guards = new Set(
        [...this.guards].filter((key) => !ids.has(key.split(":")[0])),
      );
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("DELETE FROM admin_ai_operation_state_guards")) {
      const scrubbedAt = String(values.at(-1));
      const ids = new Set(
        values
          .slice(0, -1)
          .map(String)
          .filter(
            (id) => this.operations.get(id)?.payload_scrubbed_at === scrubbedAt,
          ),
      );
      this.stateGuards = new Set(
        [...this.stateGuards].filter((key) => !ids.has(key.split(":")[0])),
      );
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("DELETE FROM admin_ai_execution_claims")) {
      const scrubbedAt = String(values.at(-1));
      for (const id of values.slice(0, -1).map(String))
        if (this.operations.get(id)?.payload_scrubbed_at === scrubbedAt)
          this.claims.delete(id);
      return { success: true, meta: { changes: 1 } };
    }
    return { success: true, meta: { changes: 1 } };
  }

  async batch(statements: FakeStatement[]) {
    this.beforeBatch?.();
    this.beforeBatch = undefined;
    this.batches.push(statements.map((statement) => statement.query));
    this.batchBindingCounts.push(
      statements.map((statement) => statement.values.length),
    );
    const students = new Map(
      [...this.students].map(([id, row]) => [id, structuredClone(row)]),
    );
    const operations = new Map(
      [...this.operations].map(([id, row]) => [id, structuredClone(row)]),
    );
    const claims = new Set(this.claims);
    const guards = new Set(this.guards);
    const stateGuards = new Set(this.stateGuards);
    const auditLength = this.audits.length;
    const archiveWrites = this.archiveWrites;
    const restoreWrites = this.restoreWrites;
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    } catch (error) {
      this.students = students;
      this.operations = operations;
      this.claims = claims;
      this.guards = guards;
      this.stateGuards = stateGuards;
      this.audits.length = auditLength;
      this.archiveWrites = archiveWrites;
      this.restoreWrites = restoreWrites;
      throw error;
    }
  }
}

function student(overrides: Partial<FakeStudent> = {}): FakeStudent {
  return {
    id: "student-rsk-1001",
    public_student_id: "RSK-1001",
    display_name: "Test Student",
    dojo_id: "dojo-rsk",
    dojo_name: "RenShinKan",
    current_belt: "6th Kyu",
    active: 1,
    profile_status: "approved",
    public_visible: 1,
    public_visible_before_archive: null,
    archived_at: null,
    deleted_at: null,
    updated_at: "2026-08-04T00:00:00.000Z",
    total_hours: 20,
    ...overrides,
  };
}

function tool(name: string, args: Record<string, unknown>) {
  return {
    tool_calls: [
      {
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  };
}

function request(message: string, requestId = crypto.randomUUID()) {
  return new Request("https://example.test/api/admin/auggie/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": requestId,
    },
    body: JSON.stringify({
      message,
      locale: "en",
      currentPath: "/admin/students",
    }),
  });
}

function operationRequest(path: string) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "X-Request-ID": crypto.randomUUID() },
  });
}

function env(db: FakeDb, run: ReturnType<typeof vi.fn>) {
  return {
    STUDENT_DB: db,
    SESSION_SECRET: "a".repeat(48),
    AI: { run },
  } as never;
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
});

describe("Admin Auggie inference boundary", () => {
  it("rejects sensitive EN/TH values and recognizable credentials without inference", async () => {
    for (const value of [
      "email: person@example.com",
      "phone +66 81 234 5678",
      "passport number: AB1234567",
      "รหัสผ่าน: ลับมาก123",
      "เลขบัตรประชาชน 1-2345-67890-12-3",
      "admin note: private medical detail",
      "questionnaire answer: private answer",
      "AKIAIOSFODNN7EXAMPLE",
      "sk-abcdefghijklmnopqrstuvwxyz123456",
      "-----BEGIN PRIVATE KEY-----",
    ])
      expect(detectSensitiveAdminAuggieInput(value), value).not.toBeNull();
    expect(
      detectSensitiveAdminAuggieInput("Open the payslip review page"),
    ).toBeNull();
    expect(
      detectSensitiveAdminAuggieInput("Search Student ID RSK-1001"),
    ).toBeNull();

    const db = new FakeDb();
    const run = vi.fn();
    const secret = "person@example.com";
    await expect(
      handleAdminAuggieChat(request(`find ${secret}`), env(db, run)),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_SENSITIVE_INPUT" });
    expect(run).not.toHaveBeenCalled();
    expect(JSON.stringify(db.audits)).not.toContain(secret);
    expect(
      db.audits.some(
        (values) => values[1] === "admin_ai_sensitive_input_rejected",
      ),
    ).toBe(true);
  });

  it("uses current function-tool payloads, latest text only, and an abort signal", async () => {
    const db = new FakeDb();
    const run = vi.fn(async () =>
      tool("navigate_admin", { destination: "dashboard" }),
    );
    await handleAdminAuggieChat(request("Open the dashboard"), env(db, run));
    const [, input, options] = run.mock.calls[0];
    expect(
      input.tools.every((entry: unknown) =>
        Boolean(
          (entry as { type?: string; function?: unknown }).type ===
            "function" && (entry as { function?: unknown }).function,
        ),
      ),
    ).toBe(true);
    expect(input.messages).toHaveLength(2);
    expect(input.messages[1]).toEqual({
      role: "user",
      content: "Open the dashboard",
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [
      "malformed",
      {
        tool_calls: [{ function: { name: "navigate_admin", arguments: "{" } }],
      },
      "ADMIN_AUGGIE_MALFORMED_TOOL",
    ],
    [
      "multiple",
      {
        tool_calls: [
          { function: { name: "navigate_admin", arguments: "{}" } },
          { function: { name: "get_dashboard_summary", arguments: "{}" } },
        ],
      },
      "ADMIN_AUGGIE_MULTIPLE_TOOLS",
    ],
    ["unknown", tool("delete_everything", {}), "ADMIN_AUGGIE_UNKNOWN_TOOL"],
  ])("rejects %s model tool output", async (_label, output, code) => {
    const db = new FakeDb();
    await expect(
      handleAdminAuggieChat(
        request("Do the task"),
        env(
          db,
          vi.fn(async () => output),
        ),
      ),
    ).rejects.toMatchObject({ code });
  });

  it("cancels a chunked body once the byte limit is crossed", async () => {
    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
        controller.enqueue(new Uint8Array(9_000));
        controller.close();
      },
    });
    const oversizedRequest = new Request(
      "https://example.test/api/admin/auggie/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: oversized,
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    );
    await expect(
      parseBoundedJson(oversizedRequest, ["message"]),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_BODY_LIMIT", status: 413 });
  });
});

describe("Admin Auggie prepared operations", () => {
  it("requires the exact phrase, replays once, and prepares a reversible undo", async () => {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student());
    const response = (await handleAdminAuggieChat(
      request("Archive RSK-1001", "archive-request-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "archive",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { operation: { id: string; confirmationPhrase: string } };

    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        response.operation.id,
        "wrong phrase",
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_CONFIRMATION_MISMATCH" });
    expect(db.operations.get(response.operation.id)?.status).toBe("prepared");
    expect(
      db.audits.filter(
        (values) => values[1] === "admin_ai_confirmation_rejected",
      ),
    ).toHaveLength(1);

    const result = (await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      response.operation.id,
      response.operation.confirmationPhrase,
      "en",
    )) as { count: number };
    expect(result.count).toBe(1);
    expect(db.archiveWrites).toBe(1);
    expect(
      db.batches.some(
        (batch) =>
          batch.some((query) =>
            query.startsWith("INSERT INTO admin_ai_operation_state_guards"),
          ) &&
          batch.some((query) =>
            query.startsWith("UPDATE students SET active = 0"),
          ),
      ),
    ).toBe(true);

    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      response.operation.id,
      response.operation.confirmationPhrase,
      "en",
    );
    expect(db.archiveWrites).toBe(1);

    const parentRow = db.operations.get(response.operation.id)!;
    parentRow.undo_expires_at = new Date(Date.now() + 60_000).toISOString();
    const undo = (await prepareAdminAuggieUndo(
      operationRequest("/api/admin/auggie/undo"),
      env(db, vi.fn()),
      response.operation.id,
      "en",
    )) as { operation: { id: string; confirmationPhrase: string } };
    expect(undo.operation.confirmationPhrase).toBe("RESTORE 1 STUDENT");
    expect(
      Date.parse(String(db.operations.get(undo.operation.id)?.expires_at)),
    ).toBeLessThanOrEqual(Date.parse(String(parentRow.undo_expires_at)));
    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      undo.operation.id,
      undo.operation.confirmationPhrase,
      "en",
    );
    expect(db.restoreWrites).toBe(1);
    expect(db.operations.get(response.operation.id)?.status).toBe("undone");
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        response.operation.id,
        response.operation.confirmationPhrase,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_ALREADY_UNDONE" });
  });

  it("returns a concurrent winner instead of recording a false stale failure", async () => {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student());
    const proposal = (await handleAdminAuggieChat(
      request("Archive RSK-1001", "race-request-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "archive",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { operation: { id: string; confirmationPhrase: string } };
    const winner = {
      ok: true,
      operationId: proposal.operation.id,
      action: "archive",
      count: 1,
    };
    db.resolveHook = () => {
      const row = db.operations.get(proposal.operation.id)!;
      Object.assign(row, {
        status: "succeeded",
        result_json: JSON.stringify(winner),
      });
      db.students.get("student-rsk-1001")!.updated_at =
        "2026-08-04T01:00:00.000Z";
    };
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
      ),
    ).resolves.toMatchObject(winner);
    expect(
      db.audits.filter((values) => values[1] === "admin_ai_write_failed"),
    ).toHaveLength(0);
  });

  it("denies cross-dojo targets in SQL and blocks stale atomic execution", async () => {
    authState.session.role = "dojo";
    authState.session.selectedDojoId = "dojo-cmu";
    authState.session.allowedDojoIds = ["dojo-cmu"];
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student());
    await expect(
      handleAdminAuggieChat(
        request("Archive RSK-1001"),
        env(
          db,
          vi.fn(async () =>
            tool("propose_student_status", {
              action: "archive",
              studentIds: ["RSK-1001"],
            }),
          ),
        ),
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_MISSING" });

    authState.session.role = "central";
    authState.session.selectedDojoId = "dojo-rsk";
    const proposal = (await handleAdminAuggieChat(
      request("Archive RSK-1001", "stale-request-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "archive",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { operation: { id: string; confirmationPhrase: string } };
    db.students.get("student-rsk-1001")!.updated_at =
      "2026-08-04T02:00:00.000Z";
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_STALE" });
    expect(db.archiveWrites).toBe(0);
    expect(
      db.audits.filter((values) => values[1] === "admin_ai_write_failed"),
    ).toHaveLength(1);
  });

  it("classifies a confirmability guard deadline race as expired", async () => {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student());
    const proposal = (await handleAdminAuggieChat(
      request("Archive RSK-1001", "expiry-race-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "archive",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { operation: { id: string; confirmationPhrase: string } };
    db.beforeBatch = () => {
      db.operations.get(proposal.operation.id)!.expires_at = new Date(
        Date.now() - 1_000,
      ).toISOString();
    };
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_EXPIRED" });
    expect(db.archiveWrites).toBe(0);
    expect(db.operations.get(proposal.operation.id)?.status).toBe("expired");
    expect(
      db.audits.filter((values) => values[1] === "admin_ai_write_expired"),
    ).toHaveLength(1);
    expect(
      db.audits.filter((values) => values[1] === "admin_ai_write_failed"),
    ).toHaveLength(0);
  });

  it("caps undo expiry and blocks inverse writes when the parent changes", async () => {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student());
    const proposal = (await handleAdminAuggieChat(
      request("Archive RSK-1001", "undo-parent-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "archive",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { operation: { id: string; confirmationPhrase: string } };
    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
    );
    const parent = db.operations.get(proposal.operation.id)!;
    parent.undo_expires_at = new Date(Date.now() + 45_000).toISOString();
    const undo = (await prepareAdminAuggieUndo(
      operationRequest("/api/admin/auggie/undo"),
      env(db, vi.fn()),
      proposal.operation.id,
      "en",
    )) as { operation: { id: string; confirmationPhrase: string } };
    expect(
      Date.parse(String(db.operations.get(undo.operation.id)?.expires_at)),
    ).toBeLessThanOrEqual(Date.parse(String(parent.undo_expires_at)));
    db.beforeBatch = () => {
      parent.undone_by_operation_id = "concurrent-undo";
    };
    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        undo.operation.id,
        undo.operation.confirmationPhrase,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_STALE" });
    expect(db.restoreWrites).toBe(0);
  });

  it("scrubs bounded ledger payloads while retaining lifecycle and audit data", async () => {
    const db = new FakeDb();
    db.students.set("student-rsk-1001", student());
    const proposal = (await handleAdminAuggieChat(
      request("Archive RSK-1001", "retention-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "archive",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { operation: { id: string; confirmationPhrase: string } };
    await confirmAdminAuggieOperation(
      operationRequest("/api/admin/auggie/confirm"),
      env(db, vi.fn()),
      proposal.operation.id,
      proposal.operation.confirmationPhrase,
      "en",
    );
    const row = db.operations.get(proposal.operation.id)!;
    row.payload_expires_at = "2026-01-01T00:00:00.000Z";
    const auditCount = db.audits.length;
    await expect(
      scrubExpiredAdminAuggiePayloads(db as never, "2026-08-04T12:00:00.000Z"),
    ).resolves.toBe(1);
    expect(row).toMatchObject({
      status: "succeeded",
      normalized_args_json: '{"scrubbed":true}',
      preview_json: "{}",
      result_json: null,
    });
    expect(row.tool_name).toBe("student_archive");
    expect(db.audits).toHaveLength(auditCount);
    expect(db.claims.has(proposal.operation.id)).toBe(false);
  });

  it("chunks retention writes below D1's 100-bind ceiling", async () => {
    const db = new FakeDb();
    for (let index = 0; index < 99; index += 1) {
      db.operations.set(`expired-${index}`, {
        id: `expired-${index}`,
        status: "succeeded",
        expires_at: "2026-01-01T00:00:00.000Z",
        payload_expires_at: "2026-01-01T00:00:00.000Z",
        payload_scrubbed_at: null,
      });
    }

    await expect(
      scrubExpiredAdminAuggiePayloads(
        db as never,
        "2026-08-04T12:00:00.000Z",
        1_000,
      ),
    ).resolves.toBe(99);
    expect(db.batches).toHaveLength(2);
    expect(Math.max(...db.batchBindingCounts.flat())).toBeLessThanOrEqual(100);
    expect(
      [...db.operations.values()].every((row) => row.payload_scrubbed_at),
    ).toBe(true);
  });

  it("keeps execution state when a selected payload becomes ineligible", async () => {
    const db = new FakeDb();
    db.operations.set("retention-race", {
      id: "retention-race",
      status: "prepared",
      expires_at: "2026-01-01T00:00:00.000Z",
      payload_expires_at: "2026-01-01T00:00:00.000Z",
      payload_scrubbed_at: null,
    });
    db.claims.add("retention-race");
    db.guards.add("retention-race:student-rsk-1001");
    db.stateGuards.add("retention-race:confirmability");
    db.beforeBatch = () => {
      const row = db.operations.get("retention-race")!;
      row.expires_at = "2099-01-01T00:00:00.000Z";
      row.payload_expires_at = "2099-01-01T00:00:00.000Z";
    };

    await expect(
      scrubExpiredAdminAuggiePayloads(db as never, "2026-08-04T12:00:00.000Z"),
    ).resolves.toBe(0);
    expect(db.operations.get("retention-race")?.payload_scrubbed_at).toBeNull();
    expect(db.claims.has("retention-race")).toBe(true);
    expect(db.guards.has("retention-race:student-rsk-1001")).toBe(true);
    expect(db.stateGuards.has("retention-race:confirmability")).toBe(true);
  });

  it("routes restores with a missing current contribution snapshot to manual review", async () => {
    const db = new FakeDb();
    db.contributionPeriodExists = true;
    db.students.set(
      "student-rsk-1001",
      student({
        active: 0,
        archived_at: "2026-08-03T00:00:00.000Z",
        public_visible: 0,
        public_visible_before_archive: 1,
      }),
    );
    const response = (await handleAdminAuggieChat(
      request("Restore RSK-1001", "contribution-restore-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "restore",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { kind: string; path: string; manualOnly: boolean };
    expect(response).toMatchObject({
      kind: "navigate",
      path: "/admin/students",
      manualOnly: true,
    });
    expect(db.operations.size).toBe(0);
  });

  it("blocks a restore atomically when the Bangkok contribution month changes", async () => {
    const db = new FakeDb();
    db.students.set(
      "student-rsk-1001",
      student({
        active: 0,
        archived_at: "2026-08-03T00:00:00.000Z",
        public_visible: 0,
        public_visible_before_archive: 1,
      }),
    );
    const proposal = (await handleAdminAuggieChat(
      request("Restore RSK-1001", "month-boundary-restore-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "restore",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { operation: { id: string; confirmationPhrase: string } };
    db.currentBangkokMonthOverride = "2099-12";

    await expect(
      confirmAdminAuggieOperation(
        operationRequest("/api/admin/auggie/confirm"),
        env(db, vi.fn()),
        proposal.operation.id,
        proposal.operation.confirmationPhrase,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_STALE" });
    expect(db.restoreWrites).toBe(0);
  });

  it("marks large direct proposals as high impact", async () => {
    const db = new FakeDb();
    const ids = Array.from(
      { length: 10 },
      (_, index) => `RSK-${String(1001 + index)}`,
    );
    ids.forEach((publicId, index) =>
      db.students.set(
        `student-${index}`,
        student({
          id: `student-${index}`,
          public_student_id: publicId,
          display_name: `Student ${index + 1}`,
          ...(index === 0
            ? { dojo_id: "dojo-cmu", dojo_name: "CMU Aikido" }
            : {}),
        }),
      ),
    );
    const response = (await handleAdminAuggieChat(
      request("Archive these exact records", "large-archive-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "archive",
            studentIds: ids,
          }),
        ),
      ),
    )) as { operation: { highImpact: boolean; warning: string } };
    expect(response.operation.highImpact).toBe(true);
    expect(response.operation.warning).toContain("High-impact change: 10");
    expect(response.operation.warning).toContain("across 2 dojo");
  });

  it("routes soft-deleted restores to the reviewed interface", async () => {
    const db = new FakeDb();
    db.students.set(
      "student-rsk-1001",
      student({
        active: 0,
        archived_at: "2026-08-03T00:00:00.000Z",
        deleted_at: "2026-08-03T01:00:00.000Z",
        public_visible: 0,
        public_visible_before_archive: 1,
      }),
    );
    const response = (await handleAdminAuggieChat(
      request("Restore RSK-1001"),
      env(
        db,
        vi.fn(async () =>
          tool("propose_student_status", {
            action: "restore",
            studentIds: ["RSK-1001"],
          }),
        ),
      ),
    )) as { kind: string; path: string; manualOnly: boolean };
    expect(response).toMatchObject({
      kind: "navigate",
      path: "/admin/students",
      manualOnly: true,
    });
    expect(db.operations.size).toBe(0);
  });
});
