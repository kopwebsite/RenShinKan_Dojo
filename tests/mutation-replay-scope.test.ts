import { describe, expect, it } from "vitest";
import type { AdminSession } from "../functions/_lib/auth";
import { scopedAdminMutationRequestId } from "../functions/_lib/studentRecords";

const env = {
  SESSION_SECRET: "test-only-scoped-mutation-secret-0000000000000000",
};

function session(overrides: Partial<AdminSession> = {}): AdminSession {
  return {
    sub: "admin",
    iat: 1,
    exp: 9_999_999_999,
    sessionId: "session-one",
    accountId: "account-one",
    adminName: "Test Administrator",
    role: "central",
    allowedDojoIds: [],
    selectedDojoId: "dojo-rsk",
    ...overrides,
  };
}

describe("administrator mutation replay scoping", () => {
  it("replays only the same account, permission, dojo, route, request, and payload", async () => {
    const payload = {
      action: "mass_rank_change",
      studentIds: ["student-0001"],
      levels: 1,
    };
    const original = await scopedAdminMutationRequestId(
      env,
      session(),
      "request-00000001",
      "admin/students/bulk",
      payload,
    );

    expect(original).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      scopedAdminMutationRequestId(
        env,
        session(),
        "request-00000001",
        "admin/students/bulk",
        payload,
      ),
    ).resolves.toBe(original);

    const variants = await Promise.all([
      scopedAdminMutationRequestId(
        env,
        session({ accountId: "account-two" }),
        "request-00000001",
        "admin/students/bulk",
        payload,
      ),
      scopedAdminMutationRequestId(
        env,
        session({ selectedDojoId: "dojo-cmu" }),
        "request-00000001",
        "admin/students/bulk",
        payload,
      ),
      scopedAdminMutationRequestId(
        env,
        session({ role: "dojo", allowedDojoIds: ["dojo-rsk"] }),
        "request-00000001",
        "admin/students/bulk",
        payload,
      ),
      scopedAdminMutationRequestId(
        env,
        session(),
        "request-00000001",
        "admin/examinations",
        payload,
      ),
      scopedAdminMutationRequestId(
        env,
        session(),
        "request-00000002",
        "admin/students/bulk",
        payload,
      ),
      scopedAdminMutationRequestId(
        env,
        session(),
        "request-00000001",
        "admin/students/bulk",
        { ...payload, levels: 2 },
      ),
    ]);

    expect(new Set([original, ...variants]).size).toBe(variants.length + 1);
  });

  it("fails closed when its server secret or dojo scope is unavailable", async () => {
    await expect(
      scopedAdminMutationRequestId(
        { SESSION_SECRET: "short" },
        session(),
        "request-00000001",
        "admin/students/bulk",
        {},
      ),
    ).rejects.toThrow("replay protection is unavailable");
    await expect(
      scopedAdminMutationRequestId(
        env,
        session({ selectedDojoId: null }),
        "request-00000001",
        "admin/students/bulk",
        {},
      ),
    ).rejects.toThrow("replay protection is unavailable");
  });
});
