import { afterEach, describe, expect, it, vi } from "vitest";
import {
  operationalEvent,
  safeRoute,
  unexpectedErrorResponse,
} from "../functions/_lib/observability";
import {
  runBindingDiagnostics,
  runReadOnlyConsistencyAudit,
} from "../functions/_lib/diagnostics";
import {
  newsletterPublishingEnabled,
  uploadsEnabled,
} from "../functions/_lib/operationalControls";
import { onRequest as middleware } from "../functions/api/_middleware";
import { uploadFilesToR2 } from "../functions/_lib/storage";

afterEach(() => vi.restoreAllMocks());

function statement(result: unknown = null, rows: unknown[] = []) {
  return {
    bind() {
      return this;
    },
    async first() {
      return result;
    },
    async all() {
      return { success: true, results: rows };
    },
    async run() {
      return { success: true };
    },
  };
}

function healthyDb() {
  return {
    prepare(query: string) {
      if (query.includes("SELECT 1 AS available"))
        return statement({ available: 1 });
      if (query.includes("FROM d1_migrations"))
        return statement({ name: "0027_remove_review_notes.sql" });
      if (
        query.includes("FROM publish_operations") &&
        query.includes("problems")
      )
        return statement({ problems: 0 });
      return statement();
    },
    async batch() {
      return [];
    },
  };
}

describe("sanitized operational observability", () => {
  it("redacts dynamic routes and never copies private request data", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = new Request(
      "https://example.test/api/admin/students/private-student-id?token=top-secret",
      {
        method: "POST",
        headers: {
          Cookie: "session=private-cookie",
          "X-Request-ID": "request-12345678",
        },
        body: JSON.stringify({ password: "private-password" }),
      },
    );
    operationalEvent("error", "database_failed", "database_failure", {
      request,
      env: { APP_ENV: "production", BUILD_ID: "release-1234567" },
      status: 503,
    });
    expect(safeRoute(request)).toBe("/api/admin/students/:id");
    const serialized = JSON.stringify(log.mock.calls[0]?.[0]);
    expect(serialized).toContain("request-12345678");
    expect(serialized).not.toContain("private-student-id");
    expect(serialized).not.toContain("top-secret");
    expect(serialized).not.toContain("private-cookie");
    expect(serialized).not.toContain("private-password");
  });

  it("returns an understandable unexpected error with a correlation ID", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = unexpectedErrorResponse(
      new Request("https://example.test/api/content", {
        headers: { "X-Request-ID": "request-abcdefgh" },
      }),
      { APP_ENV: "test", BUILD_ID: "test-build" },
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("X-Correlation-ID")).toBe("request-abcdefgh");
    expect(await response.json()).toMatchObject({
      correlationId: "request-abcdefgh",
    });
  });

  it("catches a thrown route error without logging its private message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await middleware({
      request: new Request("https://example.test/api/content"),
      env: { APP_ENV: "test", BUILD_ID: "test-build" },
      data: {},
      params: {},
      functionPath: "/api/content",
      waitUntil: () => undefined,
      passThroughOnException: () => undefined,
      next: async () => {
        throw new Error("private storage content and token");
      },
    } as never);
    expect(response.status).toBe(500);
    expect(response.headers.get("X-Correlation-ID")).toBeTruthy();
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "private storage content",
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("token");
  });

  it("adds the same correlation ID to downstream JSON 5xx responses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await middleware({
      request: new Request("https://example.test/api/admin/publish", {
        headers: { "X-Request-ID": "request-downstream" },
      }),
      env: { APP_ENV: "test", BUILD_ID: "test-build" },
      data: {},
      params: {},
      functionPath: "/api/admin/publish",
      waitUntil: () => undefined,
      passThroughOnException: () => undefined,
      next: async () =>
        new Response(JSON.stringify({ error: "Retry later" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
    } as never);
    expect(await response.json()).toEqual({
      error: "Retry later",
      correlationId: "request-downstream",
    });
  });
});

describe("health and consistency failure injection", () => {
  it("reports healthy bindings and the expected migration without resource IDs", async () => {
    const result = await runBindingDiagnostics({
      APP_ENV: "production",
      BUILD_ID: "release-1234567",
      ADMIN_PASSWORD_HASH: `hmac-sha256:${"a".repeat(64)}`,
      SESSION_SECRET: "s".repeat(32),
      STUDENT_LOOKUP_PEPPER: "p".repeat(32),
      TURNSTILE_SECRET_KEY: "turnstile-test-secret-key",
      STUDENT_DB: healthyDb(),
      CONTENT_KV: { get: async () => null, put: async () => undefined },
      MEDIA_BUCKET: {
        head: async () => null,
        get: async () => null,
        put: async () => ({}),
        delete: async () => undefined,
      },
    });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /database_id|bucket_name|namespace/i,
    );
  });

  it("fails safely for unavailable D1, KV, R2, and a missing migration", async () => {
    const db = healthyDb();
    db.prepare = (query: string) => {
      if (query.includes("d1_migrations"))
        return statement({ name: "0023_aat_payment_reversal_support.sql" });
      if (query.includes("SELECT 1 AS available"))
        return {
          ...statement(),
          async first() {
            throw new Error("private database failure");
          },
        };
      return statement({ problems: 0 });
    };
    const result = await runBindingDiagnostics({
      APP_ENV: "test",
      BUILD_ID: "test-build",
      STUDENT_DB: db,
      CONTENT_KV: {
        get: async () => {
          throw new Error("private KV value");
        },
        put: async () => undefined,
      },
      MEDIA_BUCKET: {
        head: async () => {
          throw new Error("private R2 key");
        },
        get: async () => null,
        put: async () => ({}),
        delete: async () => undefined,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.checks.d1.detail).toBe("query_failed");
    expect(result.checks.kv.detail).toBe("read_failed");
    expect(result.checks.r2.detail).toBe("head_failed");
    expect(result.checks.migrations.detail).toBe("migration_pending");
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("detects malformed KV and failed or stuck publishes without making writes", async () => {
    let writes = 0;
    const db = {
      prepare(query: string) {
        if (query.includes("UNION ALL SELECT object_key"))
          return statement(null, []);
        if (query.includes("foreign_key_violations"))
          return statement({
            foreign_key_violations: 0,
            duplicate_identifiers: 0,
            orphan_requests: 0,
            invalid_memberships: 0,
            payment_proof_metadata_gaps: 0,
            failed_publishes: 1,
            stuck_publishes: 1,
          });
        return statement();
      },
      async batch() {
        writes += 1;
        return [];
      },
    };
    const result = await runReadOnlyConsistencyAudit({
      STUDENT_DB: db,
      CONTENT_KV: {
        get: async () => "not-json",
        put: async () => {
          writes += 1;
        },
      },
      MEDIA_BUCKET: {
        list: async () => ({ objects: [], truncated: false }),
        get: async () => null,
        put: async () => {
          writes += 1;
          return {};
        },
        delete: async () => {
          writes += 1;
        },
      },
    });
    expect(result).toMatchObject({
      ok: false,
      mode: "read-only",
      repairAvailable: false,
      metrics: {
        malformedKvContent: 1,
        failedPublishes: 1,
        stuckPublishes: 1,
      },
    });
    expect(writes).toBe(0);
  });

  it("keeps emergency controls fail-open by default and explicit when disabled", () => {
    expect(uploadsEnabled({})).toBe(true);
    expect(newsletterPublishingEnabled({})).toBe(true);
    expect(uploadsEnabled({ UPLOADS_ENABLED: "false" })).toBe(false);
    expect(
      newsletterPublishingEnabled({ NEWSLETTER_PUBLISHING_ENABLED: "false" }),
    ).toBe(false);
  });

  it("removes an earlier R2 object when a later file in the upload fails", async () => {
    const stored: string[] = [];
    const deleted: string[][] = [];
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ]);
    const files = [
      new File([webp], "upload-a-first.webp", { type: "image/webp" }),
      new File([webp], "upload-b-second.webp", { type: "image/webp" }),
    ];
    await expect(
      uploadFilesToR2(
        {
          MEDIA_BUCKET: {
            get: async () => null,
            put: async (key) => {
              if (stored.length === 1) throw new Error("R2 unavailable");
              stored.push(key);
              return {};
            },
            delete: async (keys) => {
              deleted.push(Array.isArray(keys) ? keys : [keys]);
            },
          },
        },
        files,
      ),
    ).rejects.toThrow("Media storage is temporarily unavailable");
    expect(stored).toHaveLength(1);
    expect(deleted).toEqual([[stored[0]]]);
  });
});
