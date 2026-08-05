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
  requiresCentralAdmin: () => true,
  jsonResponse: (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("../functions/_lib/rateLimit", () => ({
  consumeRateLimit: async () => true,
}));

// The published website content and the subscriber provider are the two reads
// Admin Auggie performs outside the reviewed endpoints.
const site = vi.hoisted(() => ({
  recentEvents: [] as Array<Record<string, unknown>>,
  subscriberCount: 128 as number | null,
  missingEmailConfig: [] as string[],
}));

vi.mock("../functions/_lib/storage", () => ({
  readEditableContentFromStorage: async () => ({
    recentEvents: site.recentEvents,
  }),
}));

vi.mock("../functions/_lib/brevo", () => ({
  getBrevoSubscriberCount: async () => site.subscriberCount,
  missingBrevoEnv: () => site.missingEmailConfig,
}));

// Every reviewed administration endpoint is mocked so the tests can assert
// exactly what Admin Auggie delegates, how often, and with which body.
const api = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{
      route: string;
      method: string;
      url: string;
      body: Record<string, unknown>;
      headers: Record<string, string>;
    }>,
    responses: {} as Record<string, { status: number; body: Record<string, unknown> }>,
  };
  const handler =
    (route: string) =>
    async (context: { request: Request }) => {
      const { request } = context;
      let body: Record<string, unknown> = {};
      if (request.method !== "GET") {
        const type = request.headers.get("Content-Type") || "";
        body = type.includes("application/json")
          ? ((await request.json()) as Record<string, unknown>)
          : (Object.fromEntries(await request.formData()) as Record<
              string,
              unknown
            >);
      }
      state.calls.push({
        route,
        method: request.method,
        url: request.url,
        body,
        headers: Object.fromEntries(request.headers as never),
      });
      const answer = state.responses[`${request.method} ${route}`] || {
        status: 200,
        body: { ok: true },
      };
      return new Response(JSON.stringify(answer.body), {
        status: answer.status,
        headers: { "Content-Type": "application/json" },
      });
    };
  return { state, handler };
});

vi.mock("../functions/api/admin/examinations", () => ({
  onRequestPost: api.handler("examinations"),
}));
vi.mock("../functions/api/admin/examinations/[applicationId]", () => ({
  onRequestPost: api.handler("examination-application"),
}));
vi.mock("../functions/api/admin/contributions", () => ({
  onRequestPost: api.handler("contributions"),
}));
vi.mock("../functions/api/admin/payment-proofs", () => ({
  onRequestPost: api.handler("payment-proofs"),
}));
vi.mock("../functions/api/admin/newsletters/save", () => ({
  onRequestPost: api.handler("newsletter-save"),
}));
vi.mock("../functions/api/admin/newsletters/send", () => ({
  onRequestPost: api.handler("newsletter-send"),
}));
vi.mock("../functions/api/admin/newsletters/actions", () => ({
  onRequestPost: api.handler("newsletter-actions"),
}));
vi.mock("../functions/api/admin/galleries", () => ({
  onRequestGet: api.handler("galleries"),
  onRequestPut: api.handler("galleries"),
  onRequestPost: api.handler("galleries"),
}));
vi.mock("../functions/api/admin/site-content", () => ({
  onRequestGet: api.handler("site-content"),
  onRequestPut: api.handler("site-content"),
  onRequestPost: api.handler("site-content"),
}));
vi.mock("../functions/api/admin/dojos", () => ({
  onRequestGet: api.handler("dojos"),
  onRequestPut: api.handler("dojos"),
}));

import {
  confirmAdminAuggieOperation,
  handleAdminAuggieChat,
  prepareAdminAuggieUndo,
} from "../functions/_lib/adminAuggie";

// --- A minimal Admin Auggie operations database ----------------------------

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
    return Promise.resolve({ success: true as const, results: [] as T[] });
  }

  async run() {
    return this.db.execute(this);
  }
}

class FakeDb {
  operations = new Map<string, Record<string, unknown>>();
  claims = new Set<string>();
  guards = new Map<string, string>();
  stateGuards = new Set<string>();
  audits: unknown[][] = [];

  prepare(query: string) {
    return new FakeStatement(this, query.replace(/\s+/g, " ").trim());
  }

  first(statement: FakeStatement) {
    const { query, values } = statement;
    if (query.includes("WHERE idempotency_key = ?"))
      return (
        [...this.operations.values()].find(
          (row) => row.idempotency_key === values[0],
        ) || null
      );
    if (query.includes("WHERE undo_of_operation_id = ?")) return null;
    if (query.includes("SELECT * FROM admin_ai_operations WHERE id = ?"))
      return this.operations.get(String(values[0])) || null;
    if (query.includes("SELECT status FROM admin_ai_operations"))
      return this.operations.get(String(values[0])) || null;
    return null;
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
      });
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
      const key = `${operationId}:confirmability`;
      if (this.stateGuards.has(key))
        throw new Error("UNIQUE constraint failed: operation state guard");
      const row = this.operations.get(operationId);
      const observed = row
        ? `${row.status}|${String(row.expires_at) > new Date().toISOString() ? 1 : 0}|${row.payload_scrubbed_at ? 0 : 1}`
        : "missing";
      if (observed !== "prepared|1|1")
        throw new Error(
          "CHECK constraint failed: admin_ai_operation_state_matches",
        );
      this.stateGuards.add(key);
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("INSERT INTO admin_ai_execution_guards")) {
      const operationId = String(values[0]);
      // The website guards bind the observed state directly; the operation
      // guards compute theirs from the operation row itself.
      const targetId = query.includes("VALUES (?, ?, ?, ?)")
        ? String(values[1])
        : "__operation_state__";
      const expected = query.includes("VALUES (?, ?, ?, ?)")
        ? String(values[2])
        : "prepared";
      const observed = query.includes("VALUES (?, ?, ?, ?)")
        ? String(values[3])
        : String(this.operations.get(operationId)?.status || "missing");
      const key = `${operationId}:${targetId}`;
      if (this.guards.has(key))
        throw new Error("UNIQUE constraint failed: execution guard");
      if (expected !== observed)
        throw new Error("CHECK constraint failed: execution guard");
      this.guards.set(key, observed);
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("UPDATE admin_ai_operations SET status = 'succeeded'")) {
      const row = this.operations.get(String(values[7]))!;
      if (row.status !== "prepared") return { success: true, meta: { changes: 0 } };
      Object.assign(row, {
        status: "succeeded",
        confirmed_at: values[0],
        completed_at: values[1],
        result_json: values[2],
        result_fingerprints_json: values[3],
        undo_expires_at: values[4],
        payload_expires_at: values[5],
        updated_at: values[6],
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("UPDATE admin_ai_operations SET status = 'failed'")) {
      const row = this.operations.get(String(values[3]))!;
      if (row.status === "prepared")
        Object.assign(row, { status: "failed", error_code: values[0] });
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith("UPDATE admin_ai_operations SET status = 'expired'")) {
      const row = this.operations.get(String(values[2]))!;
      if (row.status === "prepared") Object.assign(row, { status: "expired" });
      return { success: true, meta: { changes: 1 } };
    }
    return { success: true, meta: { changes: 1 } };
  }

  async batch(statements: FakeStatement[]) {
    const operations = new Map(
      [...this.operations].map(([id, row]) => [id, structuredClone(row)]),
    );
    const claims = new Set(this.claims);
    const guards = new Map(this.guards);
    const stateGuards = new Set(this.stateGuards);
    const auditLength = this.audits.length;
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    } catch (error) {
      this.operations = operations;
      this.claims = claims;
      this.guards = guards;
      this.stateGuards = stateGuards;
      this.audits.length = auditLength;
      throw error;
    }
  }
}

// --- Fixtures ---------------------------------------------------------------

function newsletter(overrides: Record<string, unknown> = {}) {
  return {
    id: "newsletter-1",
    title: "Summer camp report",
    date: "2026-07-01",
    summary: "What happened at summer camp.",
    body: "A long enough newsletter body for publication.",
    slug: "summer-camp-report",
    published: false,
    contentType: "newsletter",
    category: "Dojo News",
    lifecycleStatus: "active",
    newsletterFormat: "article",
    archivedAt: null,
    trashedAt: null,
    newsletter: { status: "not_sent", sentAt: null, brevoCampaignId: null, error: null },
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
}

function photo(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    src: `/media/${id}.webp`,
    alt: `Alt for ${id}`,
    caption: `Caption for ${id}`,
    visibility: "published",
    ...overrides,
  };
}

function album(overrides: Record<string, unknown> = {}) {
  return {
    id: "album-summer-camp",
    galleryId: "on-the-mat",
    title: "Summer camp",
    visibility: "published",
    order: 0,
    photos: [photo("photo-one"), photo("photo-two"), photo("photo-three")],
    ...overrides,
  };
}

function galleryBody(
  draft: Record<string, unknown[]>,
  published: Record<string, unknown[]> = draft,
  draftUpdatedAt: string | null = "2026-08-01T00:00:00.000Z",
) {
  const fill = (value: Record<string, unknown[]>) => ({
    "on-the-mat": value["on-the-mat"] || [],
    history: value.history || [],
    achievements: value.achievements || [],
  });
  return {
    albums: fill(draft),
    publishedAlbums: fill(published),
    lastPublishedAt: "2026-07-01T00:00:00.000Z",
    draftMeta: draftUpdatedAt
      ? { updatedBy: "Someone", updatedAt: draftUpdatedAt }
      : null,
  };
}

function sitePage(overrides: Record<string, unknown> = {}) {
  return {
    id: "page-home",
    route: "/",
    status: "draft",
    translations: { en: { title: "Home", seoTitle: "", seoDescription: "" } },
    blocks: [],
    publishedAt: null,
    publishedBy: null,
    ...overrides,
  };
}

function dojoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "dojo-rsk",
    official_name: "RenShinKan Dojo",
    short_name: "RenShinKan",
    code: "RSK",
    slug: "renshinkan",
    logo_url: "/logos/rsk.png",
    active: 1,
    sort_order: 0,
    updated_at: "2026-08-01T00:00:00.000Z",
    contact: { email: "office@example.test", phone: "02-000-0000" },
  };
}

function tool(name: string, args: Record<string, unknown>) {
  return {
    tool_calls: [
      { type: "function", function: { name, arguments: JSON.stringify(args) } },
    ],
  };
}

function request(message: string, requestId = crypto.randomUUID()) {
  return new Request("https://example.test/api/admin/auggie/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Request-ID": requestId },
    body: JSON.stringify({ message, locale: "en", currentPath: "/admin/website" }),
  });
}

function operationRequest() {
  return new Request("https://example.test/api/admin/auggie/confirm", {
    method: "POST",
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

type Proposal = {
  operation: {
    id: string;
    confirmationPhrase: string;
    secondaryConfirmationPhrase?: string;
    requiresSecondaryConfirmation?: boolean;
    undoable?: boolean;
    path: string;
    warning: string;
    preview: Record<string, unknown>;
  };
};

async function prepare(
  db: FakeDb,
  toolName: string,
  args: Record<string, unknown>,
  requestId = crypto.randomUUID(),
) {
  return (await handleAdminAuggieChat(
    request("Prepare this change", requestId),
    env(
      db,
      vi.fn(async () => tool(toolName, args)),
    ),
  )) as Proposal;
}

function confirm(db: FakeDb, proposal: Proposal, second?: string) {
  return confirmAdminAuggieOperation(
    operationRequest(),
    env(db, vi.fn()),
    proposal.operation.id,
    proposal.operation.confirmationPhrase,
    "en",
    second ?? "",
  );
}

function writes() {
  return api.state.calls.filter((call) => call.method !== "GET");
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
  api.state.calls.length = 0;
  api.state.responses = {};
  site.recentEvents = [newsletter()];
  site.subscriberCount = 128;
  site.missingEmailConfig = [];
});

describe("Admin Auggie website permission scope", () => {
  it("never offers or runs a website tool outside the administrator's permission", async () => {
    authState.session.role = "dojo";
    authState.session.selectedDojoId = "dojo-cmu";
    authState.session.allowedDojoIds = ["dojo-cmu"];
    const db = new FakeDb();
    const run = vi.fn(async () =>
      tool("propose_newsletter_send", { webAddress: "summer-camp-report" }),
    );
    await expect(
      handleAdminAuggieChat(request("Send the newsletter"), env(db, run)),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_ROUTE_FORBIDDEN" });
    const offered = (
      run.mock.calls[0][1] as { tools: Array<{ function: { name: string } }> }
    ).tools.map((entry) => entry.function.name);
    for (const name of [
      "list_newsletters",
      "propose_newsletter_send",
      "propose_newsletter_website_state",
      "list_gallery_albums",
      "propose_gallery_publish",
      "list_site_pages",
      "propose_site_publish",
      "list_dojos",
      "propose_dojo_settings",
    ])
      expect(offered).not.toContain(name);
    expect(api.state.calls).toHaveLength(0);
    expect(db.operations.size).toBe(0);
  });

  // Only the tools that could apply to the message and the current page are
  // sent, so a simple question no longer carries every website tool. The
  // administrator can still reach all of them: each subject offers its own.
  it("offers the RenShinKan administrator the website tools that match the subject", async () => {
    const subjects: Array<[string, string[], string[]]> = [
      [
        "Show newsletters",
        [
          "list_newsletters",
          "propose_newsletter_website_state",
          "propose_newsletter_lifecycle",
        ],
        ["list_dojos", "propose_gallery_photo_order"],
      ],
      [
        "Reorder the album photos in the gallery",
        [
          "list_gallery_albums",
          "propose_gallery_album_order",
          "propose_gallery_photo_order",
        ],
        ["propose_newsletter_send"],
      ],
      [
        "Publish the website pages",
        ["list_site_pages", "propose_site_page_visibility", "propose_site_publish"],
        ["list_dojos"],
      ],
      ["Rename a dojo", ["list_dojos", "propose_dojo_settings"], []],
      ["Send the newsletter by email", ["propose_newsletter_send"], []],
      [
        "Permanently delete that newsletter in the trash",
        ["propose_newsletter_delete"],
        [],
      ],
    ];
    for (const [message, expected, absent] of subjects) {
      const db = new FakeDb();
      const run = vi.fn(async () => tool("list_newsletters", {}));
      await handleAdminAuggieChat(request(message), env(db, run));
      const offered = (
        run.mock.calls[0][1] as { tools: Array<{ function: { name: string } }> }
      ).tools.map((entry) => entry.function.name);
      for (const name of expected) expect(offered).toContain(name);
      for (const name of absent) expect(offered).not.toContain(name);
      expect(offered.length).toBeLessThanOrEqual(12);
    }
  });
});

describe("Admin Auggie newsletter tools", () => {
  it("lists newsletters and events with minimal fields only", async () => {
    site.recentEvents = [
      newsletter(),
      newsletter({
        id: "newsletter-2",
        slug: "open-day",
        title: "Open day",
        contentType: "event",
        published: true,
      }),
    ];
    const db = new FakeDb();
    const response = (await handleAdminAuggieChat(
      request("Show the events"),
      env(
        db,
        vi.fn(async () => tool("list_newsletters", { contentType: "event" })),
      ),
    )) as { students: Array<Record<string, string>> };
    expect(response.students).toEqual([
      {
        studentId: "open-day",
        name: "Open day",
        dojo: "Event",
        rank: "2026-07-01",
        status: "published on website",
      },
    ]);
  });

  it("publishes one newsletter through the reviewed save endpoint after one exact phrase", async () => {
    const db = new FakeDb();
    const proposal = await prepare(db, "propose_newsletter_website_state", {
      webAddress: "summer-camp-report",
      published: true,
    });
    expect(proposal.operation.confirmationPhrase).toBe("PUBLISH 1 NEWSLETTER");
    expect(proposal.operation.requiresSecondaryConfirmation).toBe(false);
    expect(proposal.operation.undoable).toBe(false);
    expect(proposal.operation.path).toBe("/admin/website");
    expect(writes()).toHaveLength(0);

    await expect(
      confirmAdminAuggieOperation(
        operationRequest(),
        env(db, vi.fn()),
        proposal.operation.id,
        "publish 1 newsletter",
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_CONFIRMATION_MISMATCH" });
    expect(writes()).toHaveLength(0);

    const result = (await confirm(db, proposal)) as {
      count: number;
      delegatedRequestId: string;
      undoable: boolean;
    };
    expect(result.undoable).toBe(false);
    const call = writes()[0];
    expect(call.route).toBe("newsletter-save");
    expect(call.headers["x-request-id"]).toBe(
      `admin-auggie:${proposal.operation.id}`,
    );
    expect(JSON.parse(String(call.body.event))).toMatchObject({
      id: "newsletter-1",
      slug: "summer-camp-report",
      published: true,
    });
    expect(call.body.expectedUpdatedAt).toBe("2026-07-02T00:00:00.000Z");
    expect(call.body.confirmSlugChange).toBe("false");

    const success = db.audits.find(
      (values) => values[1] === "admin_ai_write_succeeded",
    );
    expect(JSON.parse(String(success?.[13]))).toMatchObject({
      aiGenerated: true,
      aiAssistant: "admin_auggie",
      delegatedRoute: "admin/newsletter-save",
    });

    await confirm(db, proposal);
    expect(writes()).toHaveLength(1);
    await expect(
      prepareAdminAuggieUndo(
        operationRequest(),
        env(db, vi.fn()),
        proposal.operation.id,
        "en",
      ),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_UNDO_UNAVAILABLE" });
  });

  it("refuses a publish when the saved newsletter is not ready", async () => {
    site.recentEvents = [newsletter({ summary: "" })];
    const db = new FakeDb();
    await expect(
      prepare(db, "propose_newsletter_website_state", {
        webAddress: "summer-camp-report",
        published: true,
      }),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_STATE" });
    expect(db.operations.size).toBe(0);
  });

  it("moves a newsletter to trash and back without deleting anything", async () => {
    const db = new FakeDb();
    const trash = await prepare(db, "propose_newsletter_lifecycle", {
      webAddress: "summer-camp-report",
      lifecycle: "trash",
    });
    expect(trash.operation.confirmationPhrase).toBe("TRASH 1 NEWSLETTER");
    await confirm(db, trash);
    expect(JSON.parse(String(writes()[0].body.event))).toMatchObject({
      lifecycleStatus: "trash",
    });
    expect(writes()[0].route).toBe("newsletter-save");
  });

  it("requires two exact phrases before any real email is sent", async () => {
    const db = new FakeDb();
    const proposal = await prepare(db, "propose_newsletter_send", {
      webAddress: "summer-camp-report",
    });
    expect(proposal.operation.requiresSecondaryConfirmation).toBe(true);
    expect(proposal.operation.confirmationPhrase).toBe(
      "SEND 1 NEWSLETTER TO 128 SUBSCRIBERS",
    );
    expect(proposal.operation.secondaryConfirmationPhrase).toBe(
      "CONFIRM REAL EMAIL SEND 128 SUBSCRIBERS",
    );
    expect(proposal.operation.warning).toContain("128 real subscriber(s)");
    expect(writes()).toHaveLength(0);

    await expect(confirm(db, proposal)).rejects.toMatchObject({
      code: "ADMIN_AUGGIE_SECOND_CONFIRMATION_REQUIRED",
    });
    await expect(
      confirm(db, proposal, "CONFIRM REAL EMAIL SEND 127 SUBSCRIBERS"),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_CONFIRMATION_MISMATCH" });
    expect(writes()).toHaveLength(0);
    expect(db.operations.get(proposal.operation.id)?.status).toBe("prepared");

    const result = (await confirm(
      db,
      proposal,
      proposal.operation.secondaryConfirmationPhrase!,
    )) as { count: number };
    expect(result.count).toBe(1);
    const call = writes()[0];
    expect(call.route).toBe("newsletter-send");
    expect(call.body).toEqual({
      newsletterId: "newsletter-1",
      idempotencyKey: `admin-auggie-send-${proposal.operation.id}`,
      confirmed: true,
      confirmedRecipientCount: 128,
    });

    await confirm(db, proposal, proposal.operation.secondaryConfirmationPhrase!);
    expect(writes()).toHaveLength(1);
  });

  it("prepares no send when the newsletter was already delivered", async () => {
    site.recentEvents = [
      newsletter({
        newsletter: {
          status: "sent",
          sentAt: "2026-07-03T00:00:00.000Z",
          brevoCampaignId: 5,
          error: null,
        },
      }),
    ];
    const db = new FakeDb();
    await expect(
      prepare(db, "propose_newsletter_send", {
        webAddress: "summer-camp-report",
      }),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_STATE" });
    expect(writes()).toHaveLength(0);
  });

  it("prepares no send when the subscriber count cannot be read", async () => {
    site.subscriberCount = null;
    const db = new FakeDb();
    await expect(
      prepare(db, "propose_newsletter_send", {
        webAddress: "summer-camp-report",
      }),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_CONTENT_UNAVAILABLE" });
    expect(db.operations.size).toBe(0);
  });

  it("refuses the send when the newsletter changed after the preview", async () => {
    const db = new FakeDb();
    const proposal = await prepare(db, "propose_newsletter_send", {
      webAddress: "summer-camp-report",
    });
    site.recentEvents = [newsletter({ updatedAt: "2026-07-09T00:00:00.000Z" })];
    await expect(
      confirm(db, proposal, proposal.operation.secondaryConfirmationPhrase!),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_STALE" });
    expect(writes()).toHaveLength(0);
    expect(db.operations.get(proposal.operation.id)?.status).toBe("failed");
    expect(
      db.audits.filter((values) => values[1] === "admin_ai_write_failed"),
    ).toHaveLength(1);
  });

  it("permanently deletes only a trashed newsletter, and only after two phrases", async () => {
    const db = new FakeDb();
    await expect(
      prepare(db, "propose_newsletter_delete", {
        webAddress: "summer-camp-report",
      }),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_STATE" });

    site.recentEvents = [newsletter({ lifecycleStatus: "trash" })];
    const proposal = await prepare(db, "propose_newsletter_delete", {
      webAddress: "summer-camp-report",
    });
    expect(proposal.operation.confirmationPhrase).toBe(
      "DELETE 1 NEWSLETTER FOREVER",
    );
    expect(proposal.operation.secondaryConfirmationPhrase).toBe(
      "CONFIRM PERMANENT DELETE 1 NEWSLETTER",
    );
    await expect(confirm(db, proposal)).rejects.toMatchObject({
      code: "ADMIN_AUGGIE_SECOND_CONFIRMATION_REQUIRED",
    });
    await confirm(db, proposal, proposal.operation.secondaryConfirmationPhrase!);
    expect(writes()[0].route).toBe("newsletter-actions");
    expect(writes()[0].body).toEqual({
      action: "delete",
      confirmed: true,
      newsletterId: "newsletter-1",
    });
  });

  it("surfaces a refusal from the reviewed endpoint without recording a success", async () => {
    const db = new FakeDb();
    const proposal = await prepare(db, "propose_newsletter_website_state", {
      webAddress: "summer-camp-report",
      published: true,
    });
    api.state.responses["POST newsletter-save"] = {
      status: 409,
      body: { ok: false, error: "This newsletter was changed in another tab." },
    };
    await expect(confirm(db, proposal)).rejects.toMatchObject({
      code: "ADMIN_AUGGIE_DELEGATED_REJECTED",
    });
    expect(db.operations.get(proposal.operation.id)?.status).toBe("failed");
    expect(
      db.audits.some((values) => values[1] === "admin_ai_write_succeeded"),
    ).toBe(false);
  });
});

describe("Admin Auggie gallery tools", () => {
  function galleryDb() {
    const db = new FakeDb();
    api.state.responses["GET galleries"] = {
      status: 200,
      body: galleryBody({ "on-the-mat": [album()] }),
    };
    return db;
  }

  it("lists albums and the photos inside one album", async () => {
    const db = galleryDb();
    const albums = (await handleAdminAuggieChat(
      request("Show the albums"),
      env(
        db,
        vi.fn(async () =>
          tool("list_gallery_albums", { galleryId: "on-the-mat" }),
        ),
      ),
    )) as { students: Array<Record<string, string>> };
    expect(albums.students).toEqual([
      {
        studentId: "album-summer-camp",
        name: "Summer camp",
        dojo: "on-the-mat",
        rank: "",
        status: "published · 3 photo(s)",
      },
    ]);

    const photos = (await handleAdminAuggieChat(
      request("Show the photos"),
      env(
        db,
        vi.fn(async () =>
          tool("list_gallery_albums", {
            galleryId: "on-the-mat",
            albumId: "album-summer-camp",
          }),
        ),
      ),
    )) as { students: Array<Record<string, string>> };
    expect(photos.students.map((entry) => entry.studentId)).toEqual([
      "photo-one",
      "photo-two",
      "photo-three",
    ]);
  });

  it("saves album details into the gallery draft only", async () => {
    const db = galleryDb();
    const proposal = await prepare(db, "propose_gallery_album_update", {
      galleryId: "on-the-mat",
      albumId: "album-summer-camp",
      title: "Summer camp 2026",
      visibility: "draft",
    });
    expect(proposal.operation.confirmationPhrase).toBe("UPDATE 1 ALBUM");
    expect(proposal.operation.requiresSecondaryConfirmation).toBe(false);
    expect(proposal.operation.warning).toContain("gallery draft only");
    await confirm(db, proposal);
    const call = writes()[0];
    expect(call.route).toBe("galleries");
    expect(call.method).toBe("PUT");
    expect(call.body.galleryId).toBe("on-the-mat");
    expect(call.body.expectedUpdatedAt).toBe("2026-08-01T00:00:00.000Z");
    const saved = (call.body.albums as Record<string, Array<Record<string, unknown>>>)[
      "on-the-mat"
    ];
    expect(saved[0]).toMatchObject({
      id: "album-summer-camp",
      title: "Summer camp 2026",
      visibility: "draft",
    });
  });

  it("puts photos in a new order and refuses an incomplete list", async () => {
    const db = galleryDb();
    await expect(
      prepare(db, "propose_gallery_photo_order", {
        galleryId: "on-the-mat",
        albumId: "album-summer-camp",
        photoIds: ["photo-three", "photo-one"],
      }),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_STATE" });

    const proposal = await prepare(db, "propose_gallery_photo_order", {
      galleryId: "on-the-mat",
      albumId: "album-summer-camp",
      photoIds: ["photo-three", "photo-one", "photo-two"],
    });
    expect(proposal.operation.confirmationPhrase).toBe("REORDER 3 PHOTOS");
    await confirm(db, proposal);
    const saved = (
      writes()[0].body.albums as Record<string, Array<Record<string, unknown>>>
    )["on-the-mat"];
    expect(
      (saved[0].photos as Array<{ id: string }>).map((entry) => entry.id),
    ).toEqual(["photo-three", "photo-one", "photo-two"]);
  });

  it("changes photo captions only for the exact photo ids given", async () => {
    const db = galleryDb();
    const proposal = await prepare(db, "propose_gallery_photo_captions", {
      galleryId: "on-the-mat",
      albumId: "album-summer-camp",
      photos: [
        { photoId: "photo-two", caption: "Morning practice" },
        { photoId: "photo-three", alt: "Students bowing" },
      ],
    });
    expect(proposal.operation.confirmationPhrase).toBe("CAPTION 2 PHOTOS");
    await confirm(db, proposal);
    const saved = (
      writes()[0].body.albums as Record<string, Array<Record<string, unknown>>>
    )["on-the-mat"];
    const photos = saved[0].photos as Array<Record<string, string>>;
    expect(photos[0].caption).toBe("Caption for photo-one");
    expect(photos[1].caption).toBe("Morning practice");
    expect(photos[2].alt).toBe("Students bowing");
    expect(photos[2].caption).toBe("Caption for photo-three");
  });

  it("reorders albums and refuses an unknown album id", async () => {
    api.state.responses["GET galleries"] = {
      status: 200,
      body: galleryBody({
        "on-the-mat": [
          album(),
          album({ id: "album-grading", title: "Grading", order: 1, photos: [] }),
        ],
      }),
    };
    const db = new FakeDb();
    await expect(
      prepare(db, "propose_gallery_album_order", {
        galleryId: "on-the-mat",
        albumIds: ["album-summer-camp", "album-unknown"],
      }),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_TARGET_STATE" });

    const proposal = await prepare(db, "propose_gallery_album_order", {
      galleryId: "on-the-mat",
      albumIds: ["album-grading", "album-summer-camp"],
    });
    expect(proposal.operation.confirmationPhrase).toBe("REORDER 2 ALBUMS");
    await confirm(db, proposal);
    const saved = (
      writes()[0].body.albums as Record<string, Array<Record<string, unknown>>>
    )["on-the-mat"];
    expect(saved.map((entry) => entry.id)).toEqual([
      "album-grading",
      "album-summer-camp",
    ]);
  });

  it("requires two exact phrases before the gallery draft goes public", async () => {
    api.state.responses["GET galleries"] = {
      status: 200,
      body: galleryBody({ "on-the-mat": [album()] }, { "on-the-mat": [] }),
    };
    const db = new FakeDb();
    const proposal = await prepare(db, "propose_gallery_publish", {});
    expect(proposal.operation.confirmationPhrase).toBe(
      "PUBLISH GALLERIES TO THE WEBSITE",
    );
    expect(proposal.operation.secondaryConfirmationPhrase).toBe(
      "CONFIRM PUBLIC WEBSITE CHANGE",
    );
    await expect(confirm(db, proposal)).rejects.toMatchObject({
      code: "ADMIN_AUGGIE_SECOND_CONFIRMATION_REQUIRED",
    });
    expect(writes()).toHaveLength(0);
    await confirm(db, proposal, proposal.operation.secondaryConfirmationPhrase!);
    expect(writes()[0]).toMatchObject({ route: "galleries", method: "POST" });
    expect(writes()[0].body).toMatchObject({
      action: "publish",
      confirmed: true,
      expectedUpdatedAt: "2026-08-01T00:00:00.000Z",
    });
  });

  it("refuses a gallery publish when the draft changed after the preview", async () => {
    api.state.responses["GET galleries"] = {
      status: 200,
      body: galleryBody({ "on-the-mat": [album()] }, { "on-the-mat": [] }),
    };
    const db = new FakeDb();
    const proposal = await prepare(db, "propose_gallery_publish", {});
    api.state.responses["GET galleries"] = {
      status: 200,
      body: galleryBody(
        { "on-the-mat": [album({ title: "Renamed by someone else" })] },
        { "on-the-mat": [] },
        "2026-08-02T00:00:00.000Z",
      ),
    };
    await expect(
      confirm(db, proposal, proposal.operation.secondaryConfirmationPhrase!),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_STALE" });
    expect(writes()).toHaveLength(0);
  });
});

describe("Admin Auggie website page and dojo tools", () => {
  it("changes a page in the website draft without publishing it", async () => {
    api.state.responses["GET site-content"] = {
      status: 200,
      body: {
        content: { sitePages: [sitePage()], siteSettings: { translations: {} } },
        draftMeta: { updatedBy: "Someone", updatedAt: "2026-08-01T00:00:00.000Z" },
        revisions: [],
      },
    };
    const db = new FakeDb();
    const proposal = await prepare(db, "propose_site_page_visibility", {
      route: "/",
      status: "published",
    });
    expect(proposal.operation.confirmationPhrase).toBe(
      "SET 1 WEBSITE PAGE PUBLISHED",
    );
    expect(proposal.operation.requiresSecondaryConfirmation).toBe(false);
    await confirm(db, proposal);
    const call = writes()[0];
    expect(call).toMatchObject({ route: "site-content", method: "PUT" });
    expect(call.body.expectedUpdatedAt).toBe("2026-08-01T00:00:00.000Z");
    const content = call.body.content as Record<string, unknown>;
    expect(content.siteSettings).toEqual({ translations: {} });
    expect(content.sitePages).toEqual([sitePage({ status: "published" })]);
  });

  it("requires two exact phrases before the website draft goes public", async () => {
    api.state.responses["GET site-content"] = {
      status: 200,
      body: {
        content: {
          sitePages: [sitePage({ status: "published" })],
          siteSettings: { translations: {} },
        },
        draftMeta: { updatedBy: "Someone", updatedAt: "2026-08-01T00:00:00.000Z" },
        revisions: [],
      },
    };
    const db = new FakeDb();
    const proposal = await prepare(db, "propose_site_publish", {});
    expect(proposal.operation.confirmationPhrase).toBe("PUBLISH WEBSITE CONTENT");
    expect(proposal.operation.secondaryConfirmationPhrase).toBe(
      "CONFIRM PUBLIC WEBSITE CHANGE",
    );
    await expect(confirm(db, proposal)).rejects.toMatchObject({
      code: "ADMIN_AUGGIE_SECOND_CONFIRMATION_REQUIRED",
    });
    await confirm(db, proposal, proposal.operation.secondaryConfirmationPhrase!);
    expect(writes()[0]).toMatchObject({ route: "site-content", method: "POST" });
    expect(writes()[0].body).toMatchObject({ action: "publish", confirmed: true });
  });

  it("refuses a website publish when no draft is saved", async () => {
    api.state.responses["GET site-content"] = {
      status: 200,
      body: {
        content: { sitePages: [sitePage()], siteSettings: { translations: {} } },
        draftMeta: null,
        revisions: [],
      },
    };
    const db = new FakeDb();
    await expect(prepare(db, "propose_site_publish", {})).rejects.toMatchObject({
      code: "ADMIN_AUGGIE_TARGET_STATE",
    });
  });

  it("keeps the dojo code, web address, logo, and contact details the server holds", async () => {
    api.state.responses["GET dojos"] = { status: 200, body: { dojos: [dojoRow()] } };
    const db = new FakeDb();
    const proposal = await prepare(db, "propose_dojo_settings", {
      dojoId: "dojo-rsk",
      officialName: "RenShinKan Aikido Dojo",
      active: false,
    });
    expect(proposal.operation.confirmationPhrase).toBe("UPDATE 1 DOJO");
    await confirm(db, proposal);
    const call = writes()[0];
    expect(call).toMatchObject({ route: "dojos", method: "PUT" });
    expect(call.body).toEqual({
      id: "dojo-rsk",
      officialName: "RenShinKan Aikido Dojo",
      shortName: "RenShinKan",
      code: "RSK",
      slug: "renshinkan",
      logoUrl: "/logos/rsk.png",
      active: false,
      sortOrder: 0,
      contact: { email: "office@example.test", phone: "02-000-0000" },
    });
  });

  it("refuses a dojo outside the administrator's own scope", async () => {
    authState.session.role = "dojo";
    authState.session.selectedDojoId = "dojo-cmu";
    authState.session.allowedDojoIds = ["dojo-cmu"];
    api.state.responses["GET dojos"] = { status: 200, body: { dojos: [dojoRow()] } };
    const db = new FakeDb();
    await expect(
      prepare(db, "propose_dojo_settings", {
        dojoId: "dojo-rsk",
        active: false,
      }),
    ).rejects.toMatchObject({ code: "ADMIN_AUGGIE_ROUTE_FORBIDDEN" });
    expect(writes()).toHaveLength(0);
    expect(db.operations.size).toBe(0);
  });
});
