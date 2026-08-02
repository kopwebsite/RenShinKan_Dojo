import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  clearSessionCookie,
  createSessionCookie,
  getAdminSession,
  getAuthorizedAdminSession,
  isRenShinKanSuperAdmin,
  type AdminSession,
} from "../functions/_lib/auth";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => readFileSync(resolve(root, path), "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

function session(
  role: "central" | "dojo",
  selectedDojoId: string | null,
): AdminSession {
  return {
    sub: "admin",
    iat: 1,
    exp: 9_999_999_999,
    sessionId: `${role}-session`,
    adminName: `${role} administrator`,
    role,
    allowedDojoIds: role === "central" ? [] : [selectedDojoId || "dojo-cmu"],
    selectedDojoId,
  };
}

describe("RenShinKan administrator authorization", () => {
  const env = { SESSION_SECRET: "authorization-test-session-secret" };

  it("authorizes only a central session in the RenShinKan context", async () => {
    const centralCookie = await createSessionCookie(
      env,
      session("central", "dojo-rsk"),
    );
    const central = await getAuthorizedAdminSession(
      new Request("https://example.test/api/admin/session", {
        headers: { Cookie: centralCookie.split(";")[0] },
      }),
      env,
    );
    expect(central).toMatchObject({
      role: "central",
      selectedDojoId: "dojo-rsk",
    });
    expect(isRenShinKanSuperAdmin(central)).toBe(true);

    for (const candidate of [
      session("central", null),
      session("central", "dojo-cmu"),
      session("dojo", "dojo-rsk"),
    ]) {
      const cookie = await createSessionCookie(env, candidate);
      await expect(
        getAuthorizedAdminSession(
          new Request("https://example.test/api/admin/session", {
            headers: { Cookie: cookie.split(";")[0] },
          }),
          env,
        ),
      ).resolves.toBeNull();
    }
  });

  it("keeps the signed session format and logout invalidation intact", async () => {
    const cookie = await createSessionCookie(
      env,
      session("central", "dojo-rsk"),
    );
    const parsed = await getAdminSession(
      new Request("https://example.test/admin", {
        headers: { Cookie: cookie.split(";")[0] },
      }),
      env,
    );
    expect(parsed).toMatchObject({
      role: "central",
      selectedDojoId: "dojo-rsk",
    });
    expect(clearSessionCookie()).toContain("Max-Age=0");
  });

  it("blocks non-RenShinKan credentials during login and starts central sessions at RenShinKan", () => {
    const login = file("functions/api/admin/login.ts");
    expect(login).toContain('access.role !== "central"');
    expect(login).toContain("limited to authorized RenShinKan administrators");
    expect(login).toContain("const selectedDojoId = RENSHINKAN_DOJO_ID");
    expect(login).toContain("allowAdminLoginAttempt");
    expect(login).toContain("recordFailedAdminLoginAttempt");
  });

  it("enforces the same restriction on session and direct admin pages", () => {
    expect(file("functions/api/admin/session.ts")).toContain(
      "getAuthorizedAdminSession",
    );
    const pageGuard = file("functions/admin/[[path]].ts");
    expect(pageGuard).toContain("getAuthorizedAdminSession");
    expect(pageGuard).toContain("withPrivateNoIndex");
  });

  it("retires dojo switching without deleting dojo affiliations or filters", () => {
    for (const path of [
      "functions/api/admin/select-dojo.ts",
      "functions/api/admin/switch-dojo.ts",
    ]) {
      const source = file(path);
      expect(source).toContain("410,");
      expect(source).toContain("dojo filter");
    }
    const students = file("src/pages/AdminStudentsPage.tsx");
    expect(students).toMatch(/<label>\s*Dojo\s*<select/);
    expect(students).toContain('<option value="">All dojos</option>');
    expect(students).not.toContain("admin-dojo-filter__panel");
  });

  it("protects every student-data admin endpoint with the authorized boundary", () => {
    const apiRoot = resolve(root, "functions/api/admin");
    const exempt = new Set([
      "login.ts",
      "logout.ts",
      "select-dojo.ts",
      "switch-dojo.ts",
    ]);
    for (const path of sourceFiles(apiRoot).filter((path) =>
      path.endsWith(".ts"),
    )) {
      const relative = path.replace(`${apiRoot}\\`, "").replace(/\\/g, "/");
      if (exempt.has(relative)) continue;
      const source = readFileSync(path, "utf8");
      if (!source.includes("onRequest")) continue;
      expect(source, relative).toContain("getAuthorizedAdminSession");
    }
  });
});

describe("RenShinKan administration interface", () => {
  it("shows one all-dojo scope with no workspace switcher", () => {
    const shell = file("src/components/admin/AdminShell.tsx");
    expect(shell).toContain("<strong>All dojos</strong>");
    expect(shell).not.toContain("changeDojo");
    expect(shell).not.toContain("AdminDojoSelector");
  });

  it("keeps all three examination destinations", () => {
    const shell = file("src/components/admin/AdminShell.tsx");
    const app = file("src/App.tsx");
    for (const route of [
      "/admin/exam-applications",
      "/admin/examination-records",
      "/admin/exam-payslips",
    ]) {
      expect(shell).toContain(route);
      expect(app).toContain(route);
    }
  });

  it("removes dashboard common tasks while keeping shell sign-out", () => {
    const dashboard = file("src/pages/AdminDashboardPage.tsx");
    const shell = file("src/components/admin/AdminShell.tsx");
    expect(dashboard).not.toContain("Common tasks");
    expect(dashboard).not.toContain("Sign out");
    expect(shell).toContain("session.logout()");
  });

  it("uses focused request filters and separates exam proofs", () => {
    const students = file("src/pages/AdminStudentsPage.tsx");
    expect(students).toContain("Profile status");
    expect(students).toContain("Training status");
    expect(students).not.toContain(
      "Examination payment<select value={paymentStatus}",
    );
    const proofs = file("src/components/admin/AdminPaymentProofs.tsx");
    expect(proofs).toContain('scope: "exam" | "contributions"');
    expect(proofs).toContain("View proof");
    expect(proofs).toContain("Open full-size proof");
  });

  it("keeps profile, training, exam, contribution, and proof data server-scoped and no-store", () => {
    for (const path of [
      "functions/api/admin/students/index.ts",
      "functions/api/admin/examinations.ts",
      "functions/api/admin/memberships.ts",
      "functions/api/admin/contributions.ts",
      "functions/api/admin/payment-proofs.ts",
    ]) {
      const source = file(path);
      expect(source).toContain('"Cache-Control": "no-store"');
    }
  });
});
