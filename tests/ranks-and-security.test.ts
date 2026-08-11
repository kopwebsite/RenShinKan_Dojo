import { afterEach, describe, expect, it, vi } from "vitest";
import { RANKS, normalizeRank, promoteRank, rankIndex } from "../shared/ranks";
import {
  allowAdminLoginAttempt,
  clearAdminLoginAttempts,
  createSessionCookie,
  hasValidAdminSession,
  isSameOriginRequest,
  jsonResponse,
  recordFailedAdminLoginAttempt,
} from "../functions/_lib/auth";
import {
  currentBangkokMonthKey,
  isMonthKey,
  namesLikelyMatch,
  normalizeInternationalPhone,
  recentMonthKeys,
  verifyTurnstile,
} from "../functions/_lib/studentRecords";

afterEach(() => vi.unstubAllGlobals());

describe("official rank progression", () => {
  it("normalizes every supported rank through one ordered definition", () => {
    expect(RANKS).toHaveLength(15);
    RANKS.forEach((rank, index) => {
      expect(normalizeRank(` ${rank.toLowerCase()} `)).toBe(rank);
      expect(rankIndex(rank)).toBe(index);
    });
  });

  it("calculates valid single and multi-level promotions", () => {
    expect(promoteRank("Unranked", 1)).toBe("10 Kyu");
    expect(promoteRank("10 Kyu", 3)).toBe("7 Kyu");
    expect(promoteRank("SHO Dan-Ho", 2)).toBe("2nd Dan");
  });

  it("rejects zero, negative, fractional, unknown, and over-limit promotions", () => {
    expect(promoteRank("10 Kyu", 0)).toBeNull();
    expect(promoteRank("10 Kyu", -1)).toBeNull();
    expect(promoteRank("10 Kyu", 1.5)).toBeNull();
    expect(promoteRank("Purple belt", 1)).toBeNull();
    expect(promoteRank("3rd Dan", 1)).toBeNull();
  });
});

describe("student and administrator security", () => {
  it("uses forgiving name matching only as a secondary check", () => {
    expect(namesLikelyMatch(" Somchai  Prasert ", "somchai prasert")).toBe(
      true,
    );
    expect(namesLikelyMatch("Somchai Prasert", "Somchai Praserd")).toBe(false);
    expect(namesLikelyMatch("Somchai", "Somchai Prasert")).toBe(false);
    expect(namesLikelyMatch("Somchai Prasert", "Nattapong Kittisak")).toBe(
      false,
    );
  });

  it("creates valid Bangkok contribution month keys and a descending history window", () => {
    expect(isMonthKey(currentBangkokMonthKey())).toBe(true);
    const months = recentMonthKeys(12);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe(currentBangkokMonthKey());
    expect(new Set(months).size).toBe(12);
    expect(months.every(isMonthKey)).toBe(true);
  });

  it("normalizes local and international telephone formats against the selected calling code", () => {
    expect(normalizeInternationalPhone("+66", "081 234 5678")).toBe(
      "+66812345678",
    );
    expect(normalizeInternationalPhone("+1", "(206) 915-9115")).toBe(
      "+12069159115",
    );
    expect(normalizeInternationalPhone("+39", "+39 06 6982")).toBe("+39066982");
    expect(() => normalizeInternationalPhone("+66", "+1 206 915 9115")).toThrow(
      "selected +66",
    );
    expect(() => normalizeInternationalPhone("+66", "call me")).toThrow(
      "digits",
    );
    expect(() => normalizeInternationalPhone("66", "0812345678")).toThrow(
      "calling code",
    );
  });

  it("creates signed secure admin sessions and rejects tampering", async () => {
    const env = {
      SESSION_SECRET: "test-secret-that-is-not-used-in-production",
    };
    const cookie = await createSessionCookie(env);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(
      await hasValidAdminSession(
        new Request("https://example.test/admin", {
          headers: { Cookie: cookie.split(";")[0] },
        }),
        env,
      ),
    ).toBe(true);
    expect(
      await hasValidAdminSession(
        new Request("https://example.test/admin", {
          headers: { Cookie: `${cookie.split(";")[0]}x` },
        }),
        env,
      ),
    ).toBe(false);
  });

  it("enforces same-origin checks for mutation requests", () => {
    expect(
      isSameOriginRequest(
        new Request("https://example.test/api", {
          headers: { Origin: "https://example.test" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginRequest(
        new Request("https://example.test/api", {
          headers: { Origin: "https://attacker.test" },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        new Request("https://example.test/api", {
          headers: { Referer: "https://example.test/admin" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginRequest(
        new Request("https://example.test/api", {
          headers: { "Sec-Fetch-Site": "cross-site" },
        }),
      ),
    ).toBe(false);
  });

  it("keeps database and secret diagnostics out of JSON error responses", async () => {
    const databaseResponse = jsonResponse(
      {
        error: "D1_ERROR: UNIQUE constraint failed: students.public_student_id",
      },
      400,
    );
    const secretResponse = jsonResponse(
      {
        error: "Cloudflare API rejected Authorization: Bearer sensitive-token",
      },
      500,
    );
    const validationResponse = jsonResponse(
      { error: "Enter a valid contribution amount." },
      400,
    );

    await expect(databaseResponse.json()).resolves.toEqual({
      error:
        "The request could not be completed. Please try again or contact the site administrator.",
    });
    await expect(secretResponse.text()).resolves.not.toContain(
      "sensitive-token",
    );
    await expect(validationResponse.json()).resolves.toEqual({
      error: "Enter a valid contribution amount.",
    });
    expect(validationResponse.headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow",
    );
  });

  it("validates Turnstile success, action, hostname, expiration, and replay responses", async () => {
    const responses = [
      {
        success: true,
        action: "student-records",
        hostname: "renshinkandojo.org",
      },
      { success: true, action: "other-action", hostname: "renshinkandojo.org" },
      {
        success: true,
        action: "student-records",
        hostname: "attacker.example",
      },
      { success: false, "error-codes": ["timeout-or-duplicate"] },
    ];
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(responses.shift()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request(
      "https://renshinkandojo.org/api/records/lookup",
      { headers: { "CF-Ray": "test-SIN", "CF-Connecting-IP": "203.0.113.9" } },
    );
    const env = {
      TURNSTILE_SECRET_KEY: "test-secret",
      SITE_URL: "https://renshinkandojo.org",
    };
    expect(
      await verifyTurnstile(request, env, "valid-token", "student-records"),
    ).toBe(true);
    expect(
      await verifyTurnstile(
        request,
        env,
        "wrong-action-token",
        "student-records",
      ),
    ).toBe(false);
    expect(
      await verifyTurnstile(
        request,
        env,
        "wrong-host-token",
        "student-records",
      ),
    ).toBe(false);
    expect(
      await verifyTurnstile(
        request,
        env,
        "expired-or-replayed-token",
        "student-records",
      ),
    ).toBe(false);
    const submitted = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(submitted.get("remoteip")).toBe("203.0.113.9");
    expect(submitted.get("idempotency_key")).toMatch(/^[a-f0-9-]{36}$/i);
  });

  it("accepts Cloudflare's passing test key only outside production", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: true,
              hostname: "example.com",
              metadata: { result_with_testing_key: true },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    const request = new Request("http://localhost:8788/api/records/lookup");
    const testEnv = {
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      SITE_URL: "http://localhost:8788",
    };
    expect(
      await verifyTurnstile(
        request,
        { ...testEnv, APP_ENV: "local" },
        "XXXX.DUMMY.TOKEN.XXXX",
        "student-records",
      ),
    ).toBe(true);
    expect(
      await verifyTurnstile(
        request,
        { ...testEnv, APP_ENV: "production" },
        "XXXX.DUMMY.TOKEN.XXXX",
        "student-records",
      ),
    ).toBe(false);
  });

  it("rate-limits failed admin passwords without consuming successful attempts", async () => {
    type Row = {
      window_started_at: string;
      attempts: number;
      locked_until: string | null;
    };
    const rows = new Map<string, Row>();
    const db = {
      prepare(query: string) {
        let bindings: unknown[] = [];
        return {
          bind(...values: unknown[]) {
            bindings = values;
            return this;
          },
          async first<T>() {
            if (query.includes("INSERT INTO security_rate_limits")) {
              const actor = `${bindings[0]}:${bindings[1]}`;
              const existing = rows.get(actor);
              const now = String(bindings[5]);
              const cutoff = String(bindings[6]);
              let next: Row;
              if (!existing || existing.window_started_at <= cutoff) {
                next = {
                  window_started_at: String(bindings[2]),
                  attempts: 1,
                  locked_until: null,
                };
              } else if (existing.locked_until && existing.locked_until > now) {
                next = existing;
              } else {
                const attempts = existing.attempts + 1;
                next = {
                  ...existing,
                  attempts,
                  locked_until:
                    attempts > Number(bindings[11])
                      ? String(bindings[20])
                      : null,
                };
              }
              rows.set(actor, next);
              return next as T;
            }
            return (rows.get(`${bindings[0]}:${bindings[1]}`) ||
              null) as T | null;
          },
          async run() {
            const actor = `${bindings[0]}:${bindings[1]}`;
            if (
              query.includes("DELETE FROM security_rate_limits WHERE endpoint")
            )
              rows.delete(actor);
            return { success: true };
          },
        };
      },
    };
    const env = { STUDENT_DB: db, SESSION_SECRET: "rate-limit-test-secret" };
    const request = new Request("https://example.test/api/admin/login", {
      headers: {
        "CF-Ray": "test-SIN",
        "CF-Connecting-IP": "203.0.113.10",
        "User-Agent": "test",
      },
    });

    expect(await allowAdminLoginAttempt(request, env)).toBe(true);
    for (let attempt = 1; attempt < 8; attempt += 1)
      expect(await recordFailedAdminLoginAttempt(request, env)).toBe(true);
    expect(await allowAdminLoginAttempt(request, env)).toBe(true);
    expect(await recordFailedAdminLoginAttempt(request, env)).toBe(false);
    expect(await allowAdminLoginAttempt(request, env)).toBe(false);
    await clearAdminLoginAttempts(request, env);
    expect(await allowAdminLoginAttempt(request, env)).toBe(true);
  });
});
