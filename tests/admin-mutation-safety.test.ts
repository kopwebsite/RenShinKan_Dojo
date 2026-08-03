import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  publishEditableContent: vi.fn(),
  readEditableContentFromStorage: vi.fn(),
}));

vi.mock("../functions/_lib/auth", () => ({
  canAccessDojo: () => true,
  effectivePermissionLevel: () => "renshinkan_super_admin",
  getAuthorizedAdminSession: async () => ({
    sub: "admin",
    iat: 1,
    exp: 9_999_999_999,
    sessionId: "safety-session",
    accountId: "safety-admin",
    adminName: "Safety Administrator",
    role: "central",
    allowedDojoIds: [],
    selectedDojoId: "dojo-rsk",
  }),
  isRenShinKanSuperAdmin: () => true,
  isSameOriginRequest: () => true,
  jsonResponse: (body: unknown, status = 200, headers: HeadersInit = {}) => {
    const responseHeaders = new Headers(headers);
    responseHeaders.set("Content-Type", "application/json");
    return new Response(JSON.stringify(body), {
      status,
      headers: responseHeaders,
    });
  },
  requiresCentralAdmin: () => true,
}));

vi.mock("../functions/_lib/publishing", () => ({
  publishEditableContent: serviceMocks.publishEditableContent,
}));

vi.mock("../functions/_lib/storage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../functions/_lib/storage")>();
  return {
    ...actual,
    readEditableContentFromStorage: serviceMocks.readEditableContentFromStorage,
  };
});

import { emptyContent } from "../functions/_lib/storage";
import { onRequestPost as updateExaminations } from "../functions/api/admin/examinations";
import { onRequestPost as publishGalleries } from "../functions/api/admin/galleries";
import { onRequestGet as readAdminProof } from "../functions/api/admin/payment-proofs/[id]";
import { onRequestPut as saveSiteContent } from "../functions/api/admin/site-content";

type MockStatement = {
  query: string;
  values: unknown[];
  bind: (...values: unknown[]) => MockStatement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ success: true; results: T[] }>;
  run: () => Promise<{ success: true; meta: { changes: number } }>;
};

function statement(
  query: string,
  firstValue: unknown = null,
  onRun?: (statement: MockStatement) => number,
): MockStatement {
  const prepared: MockStatement = {
    query: query.replace(/\s+/g, " ").trim(),
    values: [],
    bind(...values) {
      prepared.values = values;
      return prepared;
    },
    async first<T>() {
      return firstValue as T | null;
    },
    async all<T>() {
      return { success: true as const, results: [] as T[] };
    },
    async run() {
      return {
        success: true as const,
        meta: { changes: onRun ? onRun(prepared) : 1 },
      };
    },
  };
  return prepared;
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceMocks.readEditableContentFromStorage.mockImplementation(async () =>
    emptyContent(),
  );
  serviceMocks.publishEditableContent.mockResolvedValue({
    operationId: "publish-operation",
    revisionNumber: 7,
    payloadSha256: "hash",
  });
});

describe("administrator mutation replay safety", () => {
  it("stores the examination-cycle update response in the mutation batch", async () => {
    let batch: MockStatement[] = [];
    const db = {
      prepare(query: string) {
        const value = query.includes("SELECT * FROM examination_cycles")
          ? { id: "cycle-0001", name: "Old title", lifecycle_status: "open" }
          : null;
        return statement(query, value);
      },
      async batch(statements: MockStatement[]) {
        batch = statements;
        return statements.map(() => ({ success: true as const }));
      },
    };
    const request = new Request("https://example.test/api/admin/examinations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": "cycle-update-request",
      },
      body: JSON.stringify({
        action: "update_cycle",
        confirmed: true,
        cycleId: "cycle-0001",
        name: "Updated title",
        lifecycleStatus: "open",
      }),
    });

    const response = await updateExaminations({
      request,
      env: {
        STUDENT_DB: db,
        SESSION_SECRET: "test-only-mutation-session-secret-00000000",
      },
    } as never);

    expect(response.status).toBe(200);
    const replay = batch.find((item) =>
      item.query.includes("INSERT INTO mutation_requests"),
    );
    expect(replay).toBeDefined();
    expect(replay?.values[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(replay?.values[0]).not.toBe("cycle-update-request");
    expect(JSON.parse(String(replay?.values[1]))).toEqual({
      ok: true,
      action: "update_cycle",
      cycleId: "cycle-0001",
    });
  });
});

describe("administrator payment-proof reads", () => {
  it("returns 410 without changing the database when the R2 object is missing", async () => {
    const run = vi.fn();
    const queries: string[] = [];
    const db = {
      prepare(query: string) {
        queries.push(query.replace(/\s+/g, " ").trim());
        return statement(
          query,
          {
            id: "proof-0001",
            object_key: "payment-proofs/missing.webp",
            content_type: "image/webp",
            original_filename: "proof.webp",
          },
          () => {
            run();
            return 1;
          },
        );
      },
    };

    const response = await readAdminProof({
      request: new Request(
        "https://example.test/api/admin/payment-proofs/proof-0001",
      ),
      env: {
        STUDENT_DB: db,
        MEDIA_BUCKET: { get: vi.fn().mockResolvedValue(null) },
      },
      params: { id: "proof-0001" },
    } as never);

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: "This payslip file is unavailable.",
    });
    expect(run).not.toHaveBeenCalled();
    expect(queries.some((query) => /^UPDATE\s/i.test(query))).toBe(false);
  });
});

describe("gallery publish completion", () => {
  it("does not run a second fallible database batch after public activation", async () => {
    const albums = {
      "on-the-mat": [],
      history: [],
      achievements: [],
    };
    const batch = vi.fn();
    const db = {
      prepare(query: string) {
        return statement(query, {
          albums_json: JSON.stringify(albums),
          updated_by: "Safety Administrator",
          updated_at: "2026-08-04T01:00:00.000Z",
        });
      },
      batch,
    };
    const request = new Request("https://example.test/api/admin/galleries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "publish",
        confirmed: true,
        expectedUpdatedAt: "2026-08-04T01:00:00.000Z",
      }),
    });

    const response = await publishGalleries({
      request,
      env: { STUDENT_DB: db },
    } as never);

    expect(response.status).toBe(200);
    expect(batch).not.toHaveBeenCalled();
    expect(serviceMocks.publishEditableContent).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({
      ok: true,
      updatedAt: "2026-08-04T01:00:00.000Z",
    });
  });
});

describe("website draft optimistic concurrency", () => {
  it("rejects a simultaneous loser and does not emit its audit", async () => {
    const runQueries: string[] = [];
    const db = {
      prepare(query: string) {
        const compact = query.replace(/\s+/g, " ").trim();
        const value = compact.includes(
          "SELECT updated_at FROM site_content_drafts",
        )
          ? { updated_at: "2026-08-04T02:00:00.000Z" }
          : null;
        return statement(query, value, () => {
          runQueries.push(compact);
          return compact.startsWith("UPDATE site_content_drafts") ? 0 : 1;
        });
      },
      batch: vi.fn(),
    };
    const request = new Request("https://example.test/api/admin/site-content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: emptyContent(),
        expectedUpdatedAt: "2026-08-04T02:00:00.000Z",
      }),
    });

    const response = await saveSiteContent({
      request,
      env: { STUDENT_DB: db },
    } as never);

    expect(response.status).toBe(409);
    expect(runQueries).toHaveLength(1);
    expect(runQueries[0]).toMatch(/^UPDATE site_content_drafts/);
    expect(
      runQueries.some((query) => query.includes("INSERT INTO audit_log")),
    ).toBe(false);
  });

  it("audits a token-matched conditional save after the write succeeds", async () => {
    const runQueries: string[] = [];
    const db = {
      prepare(query: string) {
        const compact = query.replace(/\s+/g, " ").trim();
        const value = compact.includes(
          "SELECT updated_at FROM site_content_drafts",
        )
          ? { updated_at: "2026-08-04T03:00:00.000Z" }
          : null;
        return statement(query, value, () => {
          runQueries.push(compact);
          return 1;
        });
      },
      batch: vi.fn(),
    };
    const request = new Request("https://example.test/api/admin/site-content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: emptyContent(),
        expectedUpdatedAt: "2026-08-04T03:00:00.000Z",
      }),
    });

    const response = await saveSiteContent({
      request,
      env: { STUDENT_DB: db },
    } as never);

    expect(response.status).toBe(200);
    expect(runQueries[0]).toMatch(/^UPDATE site_content_drafts/);
    expect(runQueries[1]).toContain("INSERT INTO audit_log");
    expect(db.batch).not.toHaveBeenCalled();
  });
});
