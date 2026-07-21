import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canAccessDojo,
  clearSessionCookie,
  createSessionCookie,
  getAdminSession,
  getAuthorizedAdminSession,
  isRenShinKanSuperAdmin,
  requiresCentralAdmin,
  updateRenshinKanVerifiedCookie,
  updateSelectedDojoCookie,
  verifyRenshinKanSecondaryPassword,
  type AdminSession,
} from "../functions/_lib/auth";
import { onRequestGet as guardAdminPage } from "../functions/admin/[[path]]";
import { onRequestGet as getAdminSessionResponse } from "../functions/api/admin/session";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => readFileSync(resolve(root, path), "utf8");
const cookieValue = (setCookie: string) => setCookie.split(";")[0];
const requestWithCookie = (cookie: string, path = "/api/admin/session") => new Request(`https://example.test${path}`, { headers: { Cookie: cookieValue(cookie) } });

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

function centralSession(selectedDojoId: string | null, renshinkanVerified = false): AdminSession {
  return {
    sub: "admin",
    iat: 1,
    exp: 9_999_999_999,
    sessionId: "central-session",
    adminName: "Central administrator",
    role: "central",
    allowedDojoIds: [],
    selectedDojoId,
    renshinkanVerified,
  };
}

describe("RenShinKan secondary authorization", () => {
  const env = { SESSION_SECRET: "authorization-test-session-secret", RSK_ADMIN_SECONDARY_PASSWORD: "secondary-test-password" };

  it("does not grant any protected context before dojo selection", async () => {
    const cookie = await createSessionCookie(env, centralSession(null));
    expect(await getAdminSession(requestWithCookie(cookie), env)).toMatchObject({ selectedDojoId: null, renshinkanVerified: false });
    expect(await getAuthorizedAdminSession(requestWithCookie(cookie), env)).toBeNull();
  });

  it("requires verification after selecting RenShinKan and rejects an incorrect password", async () => {
    const selectedCookie = await updateSelectedDojoCookie(env, centralSession(null), "dojo-rsk");
    const selected = await getAdminSession(requestWithCookie(selectedCookie), env);
    expect(selected).toMatchObject({ selectedDojoId: "dojo-rsk", renshinkanVerified: false });
    expect(await getAuthorizedAdminSession(requestWithCookie(selectedCookie), env)).toBeNull();
    expect(await verifyRenshinKanSecondaryPassword("incorrect", env)).toBe(false);
    expect(requiresCentralAdmin(selected)).toBe(false);
  });

  it("creates verified elevated authorization only after the correct server secret", async () => {
    expect(await verifyRenshinKanSecondaryPassword("secondary-test-password", env)).toBe(true);
    const verifiedCookie = await updateRenshinKanVerifiedCookie(env, centralSession("dojo-rsk"));
    const verified = await getAuthorizedAdminSession(requestWithCookie(verifiedCookie), env);
    expect(verified).toMatchObject({ selectedDojoId: "dojo-rsk", renshinkanVerified: true });
    expect(isRenShinKanSuperAdmin(verified)).toBe(true);
    expect(canAccessDojo(verified!, "dojo-cmu")).toBe(true);
  });

  it("clears elevated authorization when switching to another dojo", async () => {
    const switchedCookie = await updateSelectedDojoCookie(env, centralSession("dojo-rsk", true), "dojo-cmu");
    const switched = await getAuthorizedAdminSession(requestWithCookie(switchedCookie), env);
    expect(switched).toMatchObject({ selectedDojoId: "dojo-cmu", renshinkanVerified: false });
    expect(isRenShinKanSuperAdmin(switched)).toBe(false);
    expect(canAccessDojo(switched!, "dojo-cmu")).toBe(true);
    expect(canAccessDojo(switched!, "dojo-rsk")).toBe(false);
    expect(canAccessDojo(switched!, "dojo-nu")).toBe(false);
  });

  it("clears authentication, dojo selection, and verification with the logout cookie", () => {
    expect(clearSessionCookie()).toContain("Max-Age=0");
    expect(clearSessionCookie()).toContain("HttpOnly");
    const logout = file("functions/api/admin/logout.ts");
    expect(logout).toContain("clearSessionCookie");
    expect(logout).toContain("export const onRequestPost");
  });

  it("never places the initial production password in frontend or function source", () => {
    const forbidden = ["RSK", "001"].join("");
    const sources = [...sourceFiles(resolve(root, "src")), ...sourceFiles(resolve(root, "functions"))]
      .filter((path) => /\.(?:ts|tsx|js|jsx|html|css)$/.test(path))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(sources).not.toContain(forbidden);
    expect(file("functions/api/admin/verify-renshinkan.ts")).toContain("RSK_ADMIN_SECONDARY_PASSWORD");
    const accessUi = file("src/components/admin/AdminAccess.tsx");
    expect(accessUi).not.toContain(forbidden);
    expect(accessUi).toContain('name="rsk-secondary-verification"');
    expect(accessUi).toContain('autoComplete="off"');
  });

  it("throttles failed verification attempts without logging the submitted secret", () => {
    const endpoint = file("functions/api/admin/verify-renshinkan.ts");
    expect(endpoint).toContain("allowRenshinKanVerificationAttempt");
    expect(endpoint).toContain("recordFailedRenshinKanVerificationAttempt");
    expect(endpoint).toContain("Incorrect RenShinKan access password.");
    expect(endpoint).not.toMatch(/console\.(?:log|error).*password/i);
    expect(file("migrations/0008_renshinkan_secondary_verification.sql")).toContain("admin_rsk_verification_attempts");
  });
});

describe("dojo route, record, and interface scoping", () => {
  it("orders RenShinKan first using its permanent ID", () => {
    for (const path of ["functions/api/admin/session.ts", "functions/api/dojos.ts"]) {
      const source = file(path);
      expect(source).toContain("CASE WHEN id =");
      expect(source).toContain("RENSHINKAN_DOJO_ID");
    }
    expect(file("src/components/admin/AdminAccess.tsx")).toContain('left.id === "dojo-rsk"');
  });

  it("makes RenShinKan the central-login landing context without bypassing secondary verification", () => {
    const login = file("functions/api/admin/login.ts");
    expect(login).toContain('access.role === "central" ? RENSHINKAN_DOJO_ID : null');
    expect(login).toContain("selectedDojoId");
    expect(login).not.toContain("renshinkanVerified: true");
  });

  it("protects all protected admin data endpoints with a selected server context", () => {
    const paths = [
      "audit.ts", "contributions.ts", "dashboard.ts", "dojos.ts", "examinations.ts", "memberships.ts",
      "publish.ts", "site-content.ts", "site-media.ts", "students/index.ts", "students/bulk.ts", "students/upload.ts",
      "students/[id].ts", "students/[id]/application.ts", "students/[id]/exam.ts", "students/[id]/hours.ts",
      "students/[id]/hours-requests.ts", "students/[id]/inline.ts", "students/[id]/pending-image.ts",
      "students/[id]/profile-status.ts", "students/[id]/share.ts", "examinations/export.ts",
    ];
    for (const path of paths) expect(file(`functions/api/admin/${path}`)).toContain("getAuthorizedAdminSession");
  });

  it("server-protects direct admin pages and safely aliases the old membership route", () => {
    const guard = file("functions/admin/[[path]].ts");
    for (const path of ["/admin/audit", "/admin/dojos", "/admin/site-editor"]) expect(guard).toContain(path);
    expect(guard).toContain("isRenShinKanSuperAdmin");
    expect(guard).toContain("/admin/students?section=memberships");
  });

  it("normalizes trailing slashes before enforcing direct-page permissions", async () => {
    const env = { SESSION_SECRET: "trailing-slash-test" };
    const cookie = await createSessionCookie(env, centralSession("dojo-cmu"));
    const next = async () => new Response("static admin shell");
    for (const path of ["/admin/audit/", "/admin/dojos/", "/admin/site-editor/"]) {
      const response = await guardAdminPage({
        request: requestWithCookie(cookie, path), env, next,
      } as never);
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("https://example.test/admin");
    }
  });

  it("returns only authorized dojo choices to a dojo-scoped login", async () => {
    const env = {
      SESSION_SECRET: "dojo-list-scope-test",
      STUDENT_DB: {
        prepare: () => ({
          bind: (...bindings: unknown[]) => ({
            all: async () => ({
              success: true,
              results: bindings.includes("dojo-cmu")
                ? [{ id: "dojo-cmu", official_name: "Chiang Mai University Aikido Club" }]
                : [],
            }),
          }),
        }),
      },
    };
    const cookie = await createSessionCookie(env, {
      adminName: "CMU administrator", role: "dojo", allowedDojoIds: ["dojo-cmu"], selectedDojoId: null,
    });
    const response = await getAdminSessionResponse({ request: requestWithCookie(cookie), env } as never);
    expect(response.status).toBe(200);
    const body = await response.json() as { dojos: Array<{ id: string }> };
    expect(body.dojos).toEqual([{ id: "dojo-cmu", official_name: "Chiang Mai University Aikido Club" }]);
  });

  it("scopes lists, searches, counts, examinations, and memberships to selected dojo", () => {
    const students = file("functions/api/admin/students/index.ts");
    expect(students).toContain('conditions.push("s.dojo_id = ?")');
    expect(students).toContain("session.selectedDojoId");
    expect(students).toContain('summaryConditions.push("s.dojo_id = ?")');
    expect(file("functions/api/admin/dashboard.ts")).toContain("session.selectedDojoId");
    expect(file("functions/api/admin/examinations.ts")).toContain("isRenShinKanSuperAdmin");
    expect(file("functions/api/admin/memberships.ts")).toContain("session.selectedDojoId");
  });

  it("defaults student records to active plus archived and never exposes deleted rows", () => {
    const api = file("functions/api/admin/students/index.ts");
    const page = file("src/pages/AdminStudentsPage.tsx");
    expect(api).toContain('requestedStatus === "active" || requestedStatus === "archived"');
    expect(api).not.toContain('status === "deleted"');
    expect(api).toContain('summaryConditions = ["s.deleted_at IS NULL"]');
    expect(page).toContain('useState("all")');
    expect(page).toContain('<option value="all">All</option><option value="active">Active</option><option value="archived">Archived</option>');
    expect(page).not.toContain('<option value="deleted">');
    expect(page).not.toContain("All except deleted");
  });

  it("never trusts a standard admin's submitted dojo during student creation or transfer", () => {
    const create = file("functions/api/admin/students/index.ts");
    const update = file("functions/api/admin/students/[id].ts");
    expect(create).toMatch(/isRenShinKanSuperAdmin\(session\)[\s\S]*body\.dojoId[\s\S]*session\.selectedDojoId/);
    expect(update).toMatch(/isRenShinKanSuperAdmin\(session\)[\s\S]*body\.dojoId[\s\S]*existing\.dojo_id/);
    expect(file("src/pages/AdminStudentsPage.tsx")).toContain("The server assigns this dojo automatically.");
  });

  it("allows scoped cleanup only for an unattached upload owned by the current session", () => {
    const upload = file("functions/api/admin/students/upload.ts");
    expect(upload).toContain("uploadedBySession");
    expect(upload).toContain("uploadedForDojo");
    expect(upload).toContain("WHERE profile_image_url = ?");
    expect(upload).toContain("ownedBySession");
  });

  it("integrates AAT membership into Manage Students and removes its dashboard card", () => {
    const students = file("src/pages/AdminStudentsPage.tsx");
    const dashboard = file("src/pages/AdminPage.tsx");
    expect(students).toContain("AdminAatMemberships");
    expect(students).toContain("AAT Annual Membership");
    expect(file("src/pages/AdminMembershipsPage.tsx")).toContain("section=memberships");
    expect(dashboard).not.toContain('<Link to="/admin/memberships"');
  });

  it("keeps the RenShinKan landing dashboard focused on updates, students, and public preview", () => {
    const dashboard = file("src/pages/AdminPage.tsx");
    expect(dashboard).toContain("Dojo administration");
    expect(dashboard).toContain("Create a dojo update");
    expect(dashboard).toContain("Manage Students");
    expect(dashboard).toContain("Preview the website");
    expect(dashboard).not.toContain('<Link to="/admin/site-editor"');
    expect(dashboard).not.toContain('<Link to="/admin/dojos"');
  });

  it("shows Monthly Contributions only in the verified RenShinKan workspace", () => {
    const students = file("src/pages/AdminStudentsPage.tsx");
    expect(students).toContain('permissionLevel === "renshinkan_super_admin"');
    expect(students).toMatch(/superAdmin \? <button[^\n]*Monthly Contributions/);
    expect(students).toMatch(/section === "contributions" && superAdmin/);
    const endpoint = file("functions/api/admin/contributions.ts");
    expect(endpoint).toContain("requiresCentralAdmin");
    expect(endpoint).toContain("dojo_id = 'dojo-rsk'");
  });

  it("renders selected dojo identity and a switch action throughout admin navigation", () => {
    for (const path of ["src/pages/AdminPage.tsx", "src/pages/AdminStudentsPage.tsx", "src/pages/AdminDojosPage.tsx", "src/pages/AdminSiteEditorPage.tsx", "src/pages/AdminAuditPage.tsx"]) {
      const source = file(path);
      expect(source).toContain("official_name");
      expect(source).toContain("logo_url");
      expect(source).toContain("Switch dojo");
      expect(source).toContain("/ ADMIN");
    }
    expect(file("src/pages/AdminPage.tsx")).not.toContain("renshinkan-admin-hint");
  });

  it("presents an intentional limited dashboard with no global admin destinations", () => {
    const dashboard = file("src/pages/AdminPage.tsx");
    expect(dashboard).toContain('permissionLevel !== "renshinkan_super_admin"');
    expect(dashboard).toContain("Student records, examinations, hours, AAT annual membership, and submitted payslips.");
    expect(dashboard).toContain("Manage Students");
    expect(dashboard).toContain("<AdminAlerts />");
    const limitedBranch = dashboard.slice(dashboard.indexOf('permissionLevel !== "renshinkan_super_admin"'), dashboard.indexOf("const renderMediaGallery"));
    for (const destination of ["site-editor", "/admin/dojos", "Review Publish", "photographic archive"]) expect(limitedBranch).not.toContain(destination);
  });

  it("shows only real, dojo-scoped approval queues and keeps monthly contributions RenShinKan-only", () => {
    const endpoint = file("functions/api/admin/dashboard.ts");
    const alerts = file("src/components/AdminAlerts.tsx");
    for (const value of ["pending_profiles", "pending_exams", "pending_aat_payments", "pending_hours", "pending_monthly_contributions", "pending_payslips"]) expect(endpoint).toContain(value);
    expect(endpoint).toContain("s.dojo_id = ?");
    expect(endpoint).toContain("isRenShinKanSuperAdmin");
    expect(endpoint).toContain("monthlyContributions: superAdmin");
    expect(endpoint).not.toContain("operation_failures");
    for (const label of ["Profile requests", "Exam applications", "AAT annual fees", "Training hour requests", "Monthly contributions", "Submitted payslips"]) expect(alerts).toContain(label);
    expect(alerts).toContain("renshinkanOnly: true");
    expect(alerts).toContain("Showing approval work for your selected dojo only.");
  });

  it("deep-links approval cards to filtered training-hour, annual-fee, monthly, and payslip views", () => {
    expect(file("functions/api/admin/students/index.ts")).toContain('hoursStatus === "pending"');
    expect(file("src/pages/AdminStudentsPage.tsx")).toContain('get("hoursStatus") === "pending"');
    expect(file("functions/api/admin/memberships.ts")).toContain('statusFilter === "pending_payment"');
    expect(file("src/components/admin/AdminAatMemberships.tsx")).toContain("Payment awaiting approval");
    expect(file("src/components/admin/AdminMonthlyContributions.tsx")).toContain('get("status")');
  });

  it("opens Manage Students immediately after selecting a standard dojo", () => {
    expect(file("src/pages/AdminPage.tsx")).toContain('window.location.assign("/admin/students")');
    expect(file("src/components/admin/useAdminSession.ts")).toContain('window.location.assign("/admin/students")');
  });
});
