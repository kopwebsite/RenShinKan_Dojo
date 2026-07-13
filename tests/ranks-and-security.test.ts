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
import { currentBangkokMonthKey, isMonthKey, namesLikelyMatch, normalizeInternationalPhone, recentMonthKeys } from "../functions/_lib/studentRecords";

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
    expect(namesLikelyMatch(" Somchai  Prasert ", "somchai prasert")).toBe(true);
    expect(namesLikelyMatch("Somchai Prasert", "Somchai Praserd")).toBe(true);
    expect(namesLikelyMatch("Somchai Prasert", "Nattapong Kittisak")).toBe(false);
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
    expect(normalizeInternationalPhone("+66", "081 234 5678")).toBe("+66812345678");
    expect(normalizeInternationalPhone("+1", "(206) 915-9115")).toBe("+12069159115");
    expect(normalizeInternationalPhone("+39", "+39 06 6982")).toBe("+39066982");
    expect(() => normalizeInternationalPhone("+66", "+1 206 915 9115")).toThrow("selected +66");
    expect(() => normalizeInternationalPhone("+66", "call me")).toThrow("digits");
    expect(() => normalizeInternationalPhone("66", "0812345678")).toThrow("calling code");
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
    expect(isSameOriginRequest(new Request("https://example.test/api", { headers: { Referer: "https://example.test/admin" } }))).toBe(true);
    expect(isSameOriginRequest(new Request("https://example.test/api", { headers: { "Sec-Fetch-Site": "cross-site" } }))).toBe(false);
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
