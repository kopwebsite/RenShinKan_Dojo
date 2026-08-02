import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
  updateSelectedDojoCookie,
  type AdminSession,
} from "../functions/_lib/auth";
import { onRequestGet as guardAdminPage } from "../functions/admin/[[path]]";
import { onRequestGet as getAdminSessionResponse } from "../functions/api/admin/session";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => readFileSync(resolve(root, path), "utf8");
const cookieValue = (setCookie: string) => setCookie.split(";")[0];
const requestWithCookie = (cookie: string, path = "/api/admin/session") =>
  new Request(`https://example.test${path}`, {
    headers: { Cookie: cookieValue(cookie) },
  });

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

function centralSession(selectedDojoId: string | null): AdminSession {
  return {
    sub: "admin",
    iat: 1,
    exp: 9_999_999_999,
    sessionId: "central-session",
    adminName: "Central administrator",
    role: "central",
    allowedDojoIds: [],
    selectedDojoId,
  };
}

function dojoSession(selectedDojoId: string): AdminSession {
  return {
    sub: "admin",
    iat: 1,
    exp: 9_999_999_999,
    sessionId: "dojo-session",
    adminName: "Dojo administrator",
    role: "dojo",
    allowedDojoIds: [selectedDojoId],
    selectedDojoId,
  };
}

describe("primary administrator authorization", () => {
  const env = {
    SESSION_SECRET: "authorization-test-session-secret",
  };

  it("does not grant any protected context before dojo selection", async () => {
    const cookie = await createSessionCookie(env, centralSession(null));
    const session = await getAdminSession(requestWithCookie(cookie), env);
    expect(session).toMatchObject({ selectedDojoId: null });
    expect(session).not.toHaveProperty("renshinkanVerified");
    expect(
      await getAuthorizedAdminSession(requestWithCookie(cookie), env),
    ).toBeNull();
  });

  it("authorizes a central account immediately after selecting RenShinKan", async () => {
    const selectedCookie = await updateSelectedDojoCookie(
      env,
      centralSession(null),
      "dojo-rsk",
    );
    const selected = await getAdminSession(
      requestWithCookie(selectedCookie),
      env,
    );
    expect(selected).toMatchObject({ selectedDojoId: "dojo-rsk" });
    const authorized = await getAuthorizedAdminSession(requestWithCookie(selectedCookie), env);
    expect(isRenShinKanSuperAdmin(authorized)).toBe(true);
    expect(requiresCentralAdmin(selected)).toBe(true);
  });

  it("keeps RenShinKan unavailable to dojo-scoped accounts", () => {
    const scoped = dojoSession("dojo-cmu");
    expect(isRenShinKanSuperAdmin(scoped)).toBe(false);
    expect(canAccessDojo(scoped, "dojo-rsk")).toBe(false);
    expect(canAccessDojo(scoped, "dojo-cmu")).toBe(true);
  });

  it("removes the secondary challenge from runtime and UI source", () => {
    expect(existsSync(resolve(root, "functions/api/admin/verify-renshinkan.ts"))).toBe(false);
    const sources = [file("functions/_lib/auth.ts"), file("src/components/admin/AdminAccess.tsx"), file("src/components/admin/useAdminSession.ts")].join("\n");
    expect(sources).not.toMatch(/secondaryPassword|verify-renshinkan|renshinkanVerified/i);
  });

  it("clears elevated authorization when switching to another dojo", async () => {
    const switchedCookie = await updateSelectedDojoCookie(env, centralSession("dojo-rsk"), "dojo-cmu");
    const switched = await getAuthorizedAdminSession(
      requestWithCookie(switchedCookie),
      env,
    );
    expect(switched).toMatchObject({ selectedDojoId: "dojo-cmu" });
    expect(isRenShinKanSuperAdmin(switched)).toBe(false);
    expect(canAccessDojo(switched!, "dojo-cmu")).toBe(true);
    expect(canAccessDojo(switched!, "dojo-rsk")).toBe(false);
    expect(canAccessDojo(switched!, "dojo-nu")).toBe(false);
  });

  it("rotates context cookies and rejects the revoked predecessor", async () => {
    const revoked = new Set<string>();
    const db = {
      prepare(query: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async first<T>() {
                return (
                  query.includes("revoked_admin_sessions") &&
                  revoked.has(String(values[0]))
                    ? { session_id: values[0] }
                    : null
                ) as T | null;
              },
              async run() {
                if (query.includes("INSERT INTO revoked_admin_sessions"))
                  revoked.add(String(values[0]));
                return { success: true, meta: { changes: 1 } };
              },
            };
          },
        };
      },
    };
    const revocationEnv = { ...env, STUDENT_DB: db } as never;
    const original = await createSessionCookie(
      revocationEnv,
      centralSession(null),
    );
    const rotated = await updateSelectedDojoCookie(
      revocationEnv,
      centralSession(null),
      "dojo-cmu",
    );
    expect(
      await getAdminSession(requestWithCookie(original), revocationEnv),
    ).toBeNull();
    expect(
      await getAdminSession(requestWithCookie(rotated), revocationEnv),
    ).toMatchObject({ selectedDojoId: "dojo-cmu" });
  });

  it("clears authentication, dojo selection, and verification with the logout cookie", () => {
    expect(clearSessionCookie()).toContain("Max-Age=0");
    expect(clearSessionCookie()).toContain("HttpOnly");
    const logout = file("functions/api/admin/logout.ts");
    expect(logout).toContain("clearSessionCookie");
    expect(logout).toContain("revokeAdminSession");
    expect(logout).toContain("export const onRequestPost");
  });

  it("never places the initial production password or retired challenge in runtime source", () => {
    const forbidden = ["RSK", "001"].join("");
    const sources = [
      ...sourceFiles(resolve(root, "src")),
      ...sourceFiles(resolve(root, "functions")),
    ]
      .filter((path) => /\.(?:ts|tsx|js|jsx|html|css)$/.test(path))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(sources).not.toContain(forbidden);
    const accessUi = file("src/components/admin/AdminAccess.tsx");
    expect(accessUi).not.toContain(forbidden);
    expect(accessUi).not.toMatch(/secondaryPassword|RenShinKanVerification/);
    expect(existsSync(resolve(root, "functions/api/admin/verify-renshinkan.ts"))).toBe(false);
  });

  it("keeps primary authentication rate limits and safe credential logging", () => {
    const endpoint = file("functions/api/admin/login.ts");
    expect(endpoint).toContain("allowAdminLoginAttempt");
    expect(endpoint).toContain("recordFailedAdminLoginAttempt");
    expect(endpoint).not.toMatch(/console\.(?:log|error).*password/i);
  });
});

describe("dojo route, record, and interface scoping", () => {
  it("orders RenShinKan first using its permanent ID", () => {
    for (const path of [
      "functions/api/admin/session.ts",
      "functions/api/dojos.ts",
    ]) {
      const source = file(path);
      expect(source).toContain("CASE WHEN id =");
      expect(source).toContain("RENSHINKAN_DOJO_ID");
    }
    expect(file("src/components/admin/AdminAccess.tsx")).toContain(
      'left.id === "dojo-rsk"',
    );
  });

  it("requires central administrators to choose a dojo after the main login", () => {
    const login = file("functions/api/admin/login.ts");
    expect(login).toContain("const selectedDojoId = null");
    expect(login).not.toContain(
      'access.role === "central" ? RENSHINKAN_DOJO_ID',
    );
    expect(login).not.toContain("renshinkanVerified: true");
  });

  it("protects all protected admin data endpoints with a selected server context", () => {
    const paths = [
      "audit.ts",
      "contributions.ts",
      "dashboard.ts",
      "dojos.ts",
      "examinations.ts",
      "memberships.ts",
      "publish.ts",
      "site-content.ts",
      "site-media.ts",
      "students/index.ts",
      "students/bulk.ts",
      "students/upload.ts",
      "students/[id].ts",
      "students/[id]/application.ts",
      "students/[id]/exam.ts",
      "students/[id]/hours.ts",
      "students/[id]/hours-requests.ts",
      "students/[id]/inline.ts",
      "students/[id]/pending-image.ts",
      "students/[id]/profile-status.ts",
      "students/[id]/share.ts",
      "examinations/export.ts",
    ];
    for (const path of paths)
      expect(file(`functions/api/admin/${path}`)).toContain(
        "getAuthorizedAdminSession",
      );
  });

  it("server-protects direct admin pages and safely aliases the old membership route", () => {
    const guard = file("functions/admin/[[path]].ts");
    const permissions = file("shared/adminPermissions.ts");
    for (const path of ["/admin/dojos", "/admin/site-editor", "/admin/audit"])
      expect(permissions).toContain(path);
    expect(guard).toContain("adminRouteAccess");
    expect(guard).toContain("isRenShinKanSuperAdmin");
    expect(guard).toContain("/admin/students?section=memberships");
  });

  it("normalizes trailing slashes before enforcing direct-page permissions", async () => {
    const env = { SESSION_SECRET: "trailing-slash-test" };
    const cookie = await createSessionCookie(env, centralSession("dojo-cmu"));
    const next = async () => new Response("static admin shell");
    for (const path of ["/admin/dojos/", "/admin/site-editor/"]) {
      const response = await guardAdminPage({
        request: requestWithCookie(cookie, path),
        env,
        next,
      } as never);
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(
        "https://example.test/admin/dashboard",
      );
    }
    const auditResponse = await guardAdminPage({
      request: requestWithCookie(cookie, "/admin/audit/"),
      env,
      next,
    } as never);
    expect(auditResponse.status).toBe(302);
    expect(auditResponse.headers.get("Location")).toBe(
      "https://example.test/admin/dashboard",
    );
  });

  it("treats the exact admin path as a clean login boundary", async () => {
    const env = { SESSION_SECRET: "standard-dashboard-redirect-test" };
    const cookie = await createSessionCookie(env, dojoSession("dojo-cmu"));
    const response = await guardAdminPage({
      request: requestWithCookie(cookie, "/admin"),
      env,
      next: async () => new Response("dashboard"),
    } as never);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("dashboard");
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("returns only authorized dojo choices to a dojo-scoped login", async () => {
    const env = {
      SESSION_SECRET: "dojo-list-scope-test",
      STUDENT_DB: {
        prepare: (query: string) => ({
          bind: (...bindings: unknown[]) => ({
            first: async () =>
              query.includes("revoked_admin_sessions") ? null : null,
            all: async () => ({
              success: true,
              results: bindings.includes("dojo-cmu")
                ? [
                    {
                      id: "dojo-cmu",
                      official_name: "Chiang Mai University Aikido Club",
                    },
                  ]
                : [],
            }),
          }),
        }),
      },
    };
    const cookie = await createSessionCookie(env, {
      adminName: "CMU administrator",
      role: "dojo",
      allowedDojoIds: ["dojo-cmu"],
      selectedDojoId: null,
    });
    const response = await getAdminSessionResponse({
      request: requestWithCookie(cookie),
      env,
    } as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { dojos: Array<{ id: string }> };
    expect(body.dojos).toEqual([
      { id: "dojo-cmu", official_name: "Chiang Mai University Aikido Club" },
    ]);
  });

  it("scopes lists, searches, counts, examinations, and memberships to selected dojo", () => {
    const students = file("functions/api/admin/students/index.ts");
    expect(students).toContain('conditions.push("s.dojo_id = ?")');
    expect(students).toContain("session.selectedDojoId");
    expect(students).toContain('summaryConditions.push("s.dojo_id = ?")');
    expect(file("functions/api/admin/dashboard.ts")).toContain(
      "session.selectedDojoId",
    );
    expect(file("functions/api/admin/examinations.ts")).toContain(
      "isRenShinKanSuperAdmin",
    );
    expect(file("functions/api/admin/memberships.ts")).toContain(
      "session.selectedDojoId",
    );
  });

  it("keeps pending profiles on their own page and never exposes deleted or rejected rows", () => {
    const api = file("functions/api/admin/students/index.ts");
    const page = file("src/pages/AdminStudentsPage.tsx");
    expect(api.replace(/\s+/g, " ")).toContain(
      'requestedStatus === "active" || requestedStatus === "pending" || requestedStatus === "archived"',
    );
    expect(api).not.toContain('status === "deleted"');
    expect(api).toContain("\"s.profile_status <> 'rejected'\"");
    expect(page).toContain('return "pending"');
    expect(page).toContain('mode === "profileRequests"');
    expect(page).toContain(
      'params.set("profileStatus", "pending_admin_approval")',
    );
    expect(page).toContain(
      '<option value="all">All</option><option value="active">Active</option><option value="archived">Archived</option>',
    );
    expect(page).not.toContain('<option value="pending">Pending</option>');
    expect(page).not.toContain('<option value="deleted">');
    expect(page).not.toContain("All except deleted");
  });

  it("never trusts a standard admin's submitted dojo during student creation or transfer", () => {
    const create = file("functions/api/admin/students/index.ts");
    const update = file("functions/api/admin/students/[id].ts");
    expect(create).toMatch(
      /isRenShinKanSuperAdmin\(session\)[\s\S]*body\.dojoId[\s\S]*session\.selectedDojoId/,
    );
    expect(update).toMatch(
      /isRenShinKanSuperAdmin\(session\)[\s\S]*body\.dojoId[\s\S]*existing\.dojo_id/,
    );
    expect(file("src/pages/AdminStudentsPage.tsx")).toContain(
      "The server assigns this dojo automatically.",
    );
  });

  it("allows scoped cleanup only for an unattached upload owned by the current session", () => {
    const upload = file("functions/api/admin/students/upload.ts");
    expect(upload).toContain("uploadedBySession");
    expect(upload).toContain("uploadedForDojo");
    expect(upload).toContain("WHERE profile_image_url = ?");
    expect(upload).toContain("ownedBySession");
  });

  it("gives AAT membership its own page and removes its dashboard card", () => {
    const students = file("src/pages/AdminStudentsPage.tsx");
    const dashboard = file("src/pages/AdminDashboardPage.tsx");
    expect(students).toContain("AdminAatMemberships");
    expect(students).toContain("AAT annual contributions");
    expect(file("src/pages/AdminMembershipsPage.tsx")).toContain(
      "/admin/aat-contributions",
    );
    expect(dashboard).not.toContain('<Link to="/admin/memberships"');
  });

  it("opens the RenShinKan dashboard directly without a workspace chooser", () => {
    const dashboard = file("src/pages/AdminDashboardPage.tsx");
    expect(dashboard).toContain("<AdminAlerts />");
    expect(dashboard).toContain("Administration overview");
    expect(dashboard).toContain('<Link to="/admin/website">');
    expect(dashboard).toContain('<Link to="/admin/students">');
    expect(dashboard).toContain('get("switch") === "1"');
    expect(dashboard).toContain("window.history.replaceState(");
    expect(dashboard).toContain('"/admin/dashboard",');
    expect(dashboard).not.toContain("What would you like to manage?");
    expect(dashboard).not.toContain("admin-renshinkan-hub__choices");
  });

  it("shows Monthly Contributions only in the verified RenShinKan workspace", () => {
    const students = file("src/pages/AdminStudentsPage.tsx");
    const shell = file("src/components/admin/AdminShell.tsx");
    expect(students).toContain('permissionLevel === "renshinkan_super_admin"');
    expect(students).toMatch(/section === "contributions" && superAdmin/);
    expect(shell).toMatch(
      /label: t\("adminShell\.monthlyContributions"\)[\s\S]*?centralOnly: true/,
    );
    const endpoint = file("functions/api/admin/contributions.ts");
    expect(endpoint).toContain("requiresCentralAdmin");
    expect(endpoint).toContain("dojo_id = 'dojo-rsk'");
  });

  it("renders the data scope without the old Managing label in the unified administration shell", () => {
    const shell = file("src/components/admin/AdminShell.tsx");
    expect(shell).toContain("selectedDojo");
    expect(shell).toContain("official_name");
    expect(shell).toContain(
      '<Link to="/admin/dashboard?switch=1">{t("adminShell.changeDojo")}</Link>',
    );
    expect(shell).toContain('"All dojos"');
    expect(shell).not.toContain("adminShell.managing");
    expect(shell).toContain("adminShell.changeDojo");
    expect(file("src/pages/AdminPage.tsx")).not.toContain(
      "renshinkan-admin-hint",
    );
  });

  it("shows all-dojo multi-filters by default while preserving server-enforced standard scope", () => {
    const page = file("src/pages/AdminStudentsPage.tsx");
    const endpoint = file("functions/api/admin/students/index.ts");
    expect(page).toContain('className="admin-student-filter-panel"');
    expect(page).not.toContain("filtersOpen");
    expect(page).toContain('className="admin-dojo-filter"');
    expect(page).toContain('params.set("dojoIds"');
    expect(page).toContain("Examination status");
    expect(page).toContain("Examination payment");
    expect(endpoint).toContain('url.searchParams.get("dojoIds")');
    expect(endpoint).toContain("s.dojo_id IN");
    expect(endpoint).toContain('conditions.push("s.dojo_id = ?")');
    expect(endpoint.indexOf('conditions.push("s.dojo_id = ?")')).toBeLessThan(
      endpoint.indexOf("s.dojo_id IN"),
    );
  });

  it("keeps standard dojos on scoped student and audit destinations", () => {
    const dashboard = file("src/pages/AdminPage.tsx");
    expect(dashboard).toContain('permissionLevel !== "renshinkan_super_admin"');
    expect(dashboard).toContain('<Navigate to="/admin/students" replace />');
    const shell = file("src/components/admin/AdminShell.tsx");
    expect(shell).toContain('href: "/admin/audit"');
    expect(shell).toContain("centralOnly");
    expect(shell).toContain("canAccessAdminPath(item.href, permission)");
  });

  it("scopes audit records by dojo on the server while RenShinKan can see all", () => {
    const endpoint = file("functions/api/admin/audit.ts");
    const page = file("src/pages/AdminAuditPage.tsx");
    expect(endpoint).toContain("isRenShinKanSuperAdmin(session)");
    expect(endpoint).toContain("session.selectedDojoId");
    expect(endpoint).toContain("a.selected_dojo_id = ?");
    expect(endpoint).toContain("scoped_student.dojo_id = ?");
    expect(endpoint).toContain("a.entity_type = 'dojo' AND a.entity_id = ?");
    expect(page).not.toContain("Access restricted");
    expect(page).toMatch(/superAdmin \? <label>Dojo/);
    expect(page).toContain("Advanced filters");
    expect(page).toContain("Technical details");
    expect(file("src/components/admin/AdminShell.tsx")).toContain("changeDojo");
  });

  it("shows only real, dojo-scoped approval queues and keeps monthly contributions RenShinKan-only", () => {
    const endpoint = file("functions/api/admin/dashboard.ts");
    const alerts = file("src/components/AdminAlerts.tsx");
    for (const value of [
      "pending_profiles",
      "pending_exams",
      "pending_aat_payments",
      "pending_hours",
      "pending_monthly_contributions",
      "pending_payslips",
    ])
      expect(endpoint).toContain(value);
    expect(endpoint).toContain("s.dojo_id = ?");
    expect(endpoint).toContain("isRenShinKanSuperAdmin");
    expect(endpoint).toContain("monthlyContributions: superAdmin");
    expect(endpoint).not.toContain("operation_failures");
    for (const label of [
      "Profile requests",
      "Exam applications",
      "AAT annual fees",
      "Training hour requests",
      "Monthly contributions",
      "Payment proofs",
    ])
      expect(alerts).toContain(label);
    expect(alerts).toContain("renshinkanOnly: true");
    expect(alerts).toContain(
      "Showing approval work for your selected dojo only.",
    );
  });

  it("keeps approval queues independent from the normal Student Database", () => {
    const students = file("src/pages/AdminStudentsPage.tsx");
    expect(students).not.toContain("<AdminAlerts");
    expect(students).toContain(
      'type StudentPageMode = "students" | "profileRequests" | "trainingRequests"',
    );
    expect(students).toContain(
      'if (mode === "students") params.set("excludePending", "1")',
    );
    expect(students).not.toContain('className="admin-summary"');
    expect(students).toContain("useLocation");
    expect(students).toContain("location.search");
  });

  it("deep-links approval cards to filtered training-hour, annual-fee, monthly, and payslip views", () => {
    expect(file("functions/api/admin/students/index.ts")).toContain(
      'hoursStatus === "pending"',
    );
    expect(file("src/pages/AdminStudentsPage.tsx")).toContain(
      'get("hoursStatus") === "pending"',
    );
    expect(file("functions/api/admin/memberships.ts")).toContain(
      'statusFilter === "pending_payment"',
    );
    expect(file("src/components/admin/AdminAatMemberships.tsx")).toContain(
      "Payment awaiting approval",
    );
    expect(
      file("src/components/admin/AdminMonthlyContributions.tsx"),
    ).toContain('get("status")');
  });

  it("combines new and unpaid AAT records into one payment-required filter", () => {
    const students = file("src/pages/AdminStudentsPage.tsx");
    const studentApi = file("functions/api/admin/students/index.ts");
    const memberships = file("src/components/admin/AdminAatMemberships.tsx");
    const membershipApi = file("functions/api/admin/memberships.ts");
    expect(students).toContain(
      '<option value="payment_required">Payment required</option>',
    );
    expect(students).not.toContain('<option value="new">NEW</option>');
    expect(studentApi).toContain('aatStatus === "payment_required"');
    expect(studentApi).toContain(
      "(s.aat_number IS NULL OR s.aat_last_paid_date IS NULL)",
    );
    expect(memberships).toContain(
      '<option value="payment_required">Payment required</option>',
    );
    expect(membershipApi).toContain('statusFilter === "payment_required"');
  });

  it("opens the authenticated dashboard after selecting a dojo", () => {
    expect(file("src/pages/AdminPage.tsx")).toContain("useAdminSession()");
    expect(file("src/components/admin/useAdminSession.ts")).toContain(
      'navigate("/admin/dashboard", { replace: true })',
    );
  });
});
