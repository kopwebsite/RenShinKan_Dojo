import { describe, expect, it } from "vitest";
import { RANKS, normalizeRank, promoteRank, rankIndex } from "../shared/ranks";
import {
  allowAdminLoginAttempt,
  clearAdminLoginAttempts,
  createSessionCookie,
  hasValidAdminSession,
  isSameOriginRequest,
  recordFailedAdminLoginAttempt,
} from "../functions/_lib/auth";
import { hashStudentPin, verifyStudentPin } from "../functions/_lib/studentRecords";

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
  it("hashes student PINs with a unique salt and verifies without storing plaintext", async () => {
    const first = await hashStudentPin("123456");
    const second = await hashStudentPin("123456");
    expect(first).not.toBe(second);
    expect(first).not.toContain("123456");
    expect(await verifyStudentPin("123456", first)).toBe(true);
    expect(await verifyStudentPin("654321", first)).toBe(false);
  });

  it("rejects unsafe PIN formats", async () => {
    await expect(hashStudentPin("12345")).rejects.toThrow(/6 to 12 digits/);
    await expect(hashStudentPin("password")).rejects.toThrow(/6 to 12 digits/);
  });

  it("creates signed secure admin sessions and rejects tampering", async () => {
    const env = { SESSION_SECRET: "test-secret-that-is-not-used-in-production" };
    const cookie = await createSessionCookie(env);
    expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure"); expect(cookie).toContain("SameSite=Lax");
    expect(await hasValidAdminSession(new Request("https://example.test/admin", { headers: { Cookie: cookie.split(";")[0] } }), env)).toBe(true);
    expect(await hasValidAdminSession(new Request("https://example.test/admin", { headers: { Cookie: `${cookie.split(";")[0]}x` } }), env)).toBe(false);
  });

  it("enforces same-origin checks for mutation requests", () => {
    expect(isSameOriginRequest(new Request("https://example.test/api", { headers: { Origin: "https://example.test" } }))).toBe(true);
    expect(isSameOriginRequest(new Request("https://example.test/api", { headers: { Origin: "https://attacker.test" } }))).toBe(false);
  });

  it("rate-limits failed admin passwords without consuming successful attempts", async () => {
    type Row = { window_started_at: string; attempts: number; locked_until: string | null };
    const rows = new Map<string, Row>();
    const db = {
      prepare(query: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async first<T>() { return (rows.get(String(values[0])) || null) as T | null; },
              async run() {
                const actor = String(values[0]);
                if (query.startsWith("DELETE")) rows.delete(actor);
                else rows.set(actor, { window_started_at: String(values[1]), attempts: Number(values[2]), locked_until: values[3] ? String(values[3]) : null });
              },
            };
          },
        };
      },
    };
    const env = { STUDENT_DB: db };
    const request = new Request("https://example.test/api/admin/login", { headers: { "CF-Connecting-IP": "203.0.113.10", "User-Agent": "test" } });

    expect(await allowAdminLoginAttempt(request, env)).toBe(true);
    for (let attempt = 1; attempt < 8; attempt += 1) expect(await recordFailedAdminLoginAttempt(request, env)).toBe(true);
    expect(await allowAdminLoginAttempt(request, env)).toBe(true);
    expect(await recordFailedAdminLoginAttempt(request, env)).toBe(false);
    expect(await allowAdminLoginAttempt(request, env)).toBe(false);
    await clearAdminLoginAttempts(request, env);
    expect(await allowAdminLoginAttempt(request, env)).toBe(true);
  });
});
