import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import {
  authenticateAdminPassword,
  canAccessDojo,
  createSessionCookie,
  getAdminSession,
  requiresCentralAdmin,
  type AdminSession,
} from "../functions/_lib/auth";
import { buildExamPdf, buildExamXlsx } from "../functions/_lib/examExports";
import { validateEditableContent } from "../functions/_lib/content";
import {
  bangkokGregorianYear,
  formatStudentId,
  studentIdSequenceForCurrentYear,
} from "../functions/_lib/studentRecords";
import { aatMembershipStatus, addOneCalendarYear } from "../shared/membership";
import {
  onRequestGet as getStudent,
  onRequestPut as putStudent,
} from "../functions/api/admin/students/[id]";
import { onRequestPost as loginAdmin } from "../functions/api/admin/login";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => readFileSync(resolve(root, path), "utf8");

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function session(
  role: "central" | "dojo",
  allowedDojoIds: string[] = [],
  selectedDojoId = allowedDojoIds[0] || "dojo-rsk",
  renshinkanVerified = role === "central" && selectedDojoId === "dojo-rsk",
): AdminSession {
  return {
    sub: "admin",
    iat: 1,
    exp: 9_999_999_999,
    sessionId: "session",
    adminName: "Test administrator",
    role,
    allowedDojoIds,
    selectedDojoId,
    renshinkanVerified,
  };
}

describe("multi-dojo authentication and authorization", () => {
  it("requires an administrator name at login and maps distinct server-side password hashes", async () => {
    const secret = "test-session-secret";
    const central = await hmac(secret, "central-pass");
    const cmu = await hmac(secret, "cmu-pass");
    const env = {
      SESSION_SECRET: secret,
      ADMIN_PASSWORD_HASH: central,
      DOJO_ADMIN_PASSWORD_HASHES: JSON.stringify({ "dojo-cmu": cmu }),
    };
    expect(await authenticateAdminPassword("central-pass", env)).toMatchObject({
      role: "central",
      allowedDojoIds: [],
      accountId: "legacy-central",
      displayName: "Central administrator",
    });
    expect(await authenticateAdminPassword("cmu-pass", env)).toMatchObject({
      role: "dojo",
      allowedDojoIds: ["dojo-cmu"],
      accountId: "legacy-dojo-cmu",
      displayName: "Dojo administrator",
    });
    expect(await authenticateAdminPassword("wrong", env)).toBeNull();
    expect(file("functions/api/admin/login.ts")).toContain(
      "Your name is required",
    );
  });

  it("accepts a slow PBKDF2 primary password verifier", async () => {
    const env = {
      SESSION_SECRET: "independent-session-secret",
      ADMIN_PASSWORD_HASH:
        "pbkdf2-sha256:310000:9KVU5Gludst6J9W2eYQjWHmI:XBfKDdpvW9cNQEfij-bdeBHxJsmq9vr5FUAOHhteRyE",
    };
    expect(
      await authenticateAdminPassword("central-pass-test-value", env),
    ).toMatchObject({
      role: "central",
      allowedDojoIds: [],
      accountId: "legacy-central",
    });
    expect(
      await authenticateAdminPassword("wrong-password-value", env),
    ).toBeNull();
  });

  it("fails closed when durable rate-limit storage is unavailable", async () => {
    const secret = "central-login-selection-test";
    const env = {
      SESSION_SECRET: secret,
      ADMIN_PASSWORD_HASH: await hmac(secret, "central-pass"),
    };
    const response = await loginAdmin({
      request: new Request("https://example.test/api/admin/login", {
        method: "POST",
        headers: {
          Origin: "https://example.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          adminName: "Central Admin",
          password: "central-pass",
        }),
      }),
      env,
    } as never);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "Sign-in is temporarily unavailable.",
    });
  });

  it("keeps selected dojo separate from allowed dojo and rejects a cross-dojo request", () => {
    const central = session("central");
    const centralAtCmu = session("central", [], "dojo-cmu", false);
    const cmu = session("dojo", ["dojo-cmu"]);
    expect(requiresCentralAdmin(central)).toBe(true);
    expect(requiresCentralAdmin(cmu)).toBe(false);
    expect(canAccessDojo(cmu, "dojo-cmu")).toBe(true);
    expect(canAccessDojo(cmu, "dojo-nu")).toBe(false);
    expect(canAccessDojo(central, "dojo-nu")).toBe(true);
    expect(canAccessDojo(centralAtCmu, "dojo-cmu")).toBe(true);
    expect(canAccessDojo(centralAtCmu, "dojo-nu")).toBe(false);
    const selection = file("functions/api/admin/select-dojo.ts");
    expect(selection).toContain("canSelectDojo");
    expect(selection).toContain("does not have access to that dojo");
  });

  it("signs role, allowed dojos, administrator name, and selection into a tamper-evident cookie", async () => {
    const env = { SESSION_SECRET: "signed-role-test-secret" };
    const cookie = await createSessionCookie(env, {
      adminName: "Naree",
      role: "dojo",
      allowedDojoIds: ["dojo-cmu"],
      selectedDojoId: "dojo-cmu",
    });
    const parsed = await getAdminSession(
      new Request("https://example.test/admin", {
        headers: { Cookie: cookie.split(";")[0] },
      }),
      env,
    );
    expect(parsed).toMatchObject({
      adminName: "Naree",
      role: "dojo",
      allowedDojoIds: ["dojo-cmu"],
      selectedDojoId: "dojo-cmu",
    });
  });

  it("returns 403 for direct read and write API attempts against another dojo", async () => {
    const authEnv = { SESSION_SECRET: "direct-api-scope-secret" };
    const cookie = await createSessionCookie(authEnv, {
      adminName: "CMU Admin",
      role: "dojo",
      allowedDojoIds: ["dojo-cmu"],
      selectedDojoId: "dojo-cmu",
    });
    const db = {
      prepare: (query: string) => ({
        bind: () => ({
          first: async () =>
            query.includes("revoked_admin_sessions")
              ? null
              : { id: "nu-student", dojo_id: "dojo-nu" },
        }),
      }),
    };
    const env = { ...authEnv, STUDENT_DB: db } as never;
    const getResponse = await getStudent({
      request: new Request(
        "https://example.test/api/admin/students/nu-student",
        { headers: { Cookie: cookie.split(";")[0] } },
      ),
      env,
      params: { id: "nu-student" },
    } as never);
    expect(getResponse.status).toBe(403);
    expect(await getResponse.json()).toMatchObject({
      error: expect.stringContaining("not have access"),
    });
    const putResponse = await putStudent({
      request: new Request(
        "https://example.test/api/admin/students/nu-student",
        {
          method: "PUT",
          headers: {
            Cookie: cookie.split(";")[0],
            Origin: "https://example.test",
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      ),
      env,
      params: { id: "nu-student" },
    } as never);
    expect(putResponse.status).toBe(403);
  });
});

describe("multi-dojo data model and workflows", () => {
  const migration = file("migrations/0006_multi_dojo_administration.sql");
  it("creates exactly the six official dojo seeds without destructive data reset", () => {
    for (const name of [
      "Ai Dojo",
      "Chiang Mai University Aikido Club",
      "RenShinKan Dojo",
      "Naresuan University Aikido Club",
      "All Gym Chiang Mai",
      "Aikido Mae Hong Son",
    ])
      expect(migration).toContain(name);
    expect(migration).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM\s+students/i);
    expect(migration).toContain("UPDATE students");
    expect(migration).toContain("ELSE 'dojo-rsk'");
  });

  it("generates dojo-prefixed Gregorian-year IDs without renumbering legacy IDs", () => {
    expect(bangkokGregorianYear(new Date("2026-07-22T00:00:00Z"))).toBe(2026);
    expect(formatStudentId(1, "RSK", 2026)).toBe("RSK-2601");
    expect(formatStudentId(2, "cmu", 2026)).toBe("CMU-2602");
    expect(formatStudentId(1, "RSK", 2027)).toBe("RSK-2701");
    expect(
      studentIdSequenceForCurrentYear(
        "RSK-2612",
        "RSK",
        new Date("2026-07-22T00:00:00Z"),
      ),
    ).toEqual({ gregorianYear: 2026, sequence: 12 });
    expect(
      studentIdSequenceForCurrentYear(
        "RSK-6909",
        "RSK",
        new Date("2026-07-22T00:00:00Z"),
      ),
    ).toBeNull();
    expect("RSK-6901").toBe("RSK-6901");
    const records = file("functions/_lib/studentRecords.ts");
    expect(records).toContain("ON CONFLICT(dojo_id, gregorian_year)");
    expect(records).toContain("RETURNING last_number");
    const yearlyMigration = file(
      "migrations/0020_gregorian_student_id_sequences.sql",
    );
    expect(yearlyMigration).toContain("PRIMARY KEY (dojo_id, gregorian_year)");
    expect(yearlyMigration).toContain("strftime('%Y', 'now', '+7 hours')");
    expect(yearlyMigration).toContain("MAX(CASE");
    expect(yearlyMigration).not.toMatch(/DROP\s+TABLE|UPDATE\s+students/i);
  });

  it("requires dojo assignment for admin creation and self-registration, leaving AAT number nullable", () => {
    const admin = file("functions/api/admin/students/index.ts");
    const self = file("functions/api/records/profile-requests.ts");
    for (const source of [admin, self]) {
      expect(source).toContain("activeDojo");
      expect(source).toContain("aatNumber");
      expect(source).toContain("aatLastPaidDate");
    }
    expect(file("src/pages/StudentRecordsPage.tsx")).toContain(
      "Not yet paid or payment date unknown",
    );
  });

  it("calculates NEW, unpaid, current, expiring, and expired AAT states", () => {
    expect(
      aatMembershipStatus(null, null, new Date("2026-07-21T00:00:00Z")),
    ).toMatchObject({ state: "new", label: "Payment required" });
    expect(
      aatMembershipStatus("AAT-7", null, new Date("2026-07-21T00:00:00Z"))
        .state,
    ).toBe("unpaid");
    expect(
      aatMembershipStatus(null, "2026-01-01", new Date("2026-07-21T00:00:00Z"))
        .state,
    ).toBe("current");
    expect(
      aatMembershipStatus(
        "AAT-7",
        "2026-01-01",
        new Date("2026-07-21T00:00:00Z"),
      ).state,
    ).toBe("current");
    expect(
      aatMembershipStatus(
        "AAT-7",
        "2025-08-01",
        new Date("2026-07-21T00:00:00Z"),
      ).state,
    ).toBe("expiring");
    expect(
      aatMembershipStatus(
        "AAT-7",
        "2025-01-01",
        new Date("2026-07-21T00:00:00Z"),
      ).state,
    ).toBe("expired");
    expect(addOneCalendarYear("2024-02-29")).toBe("2025-02-28");
  });

  it("keeps AAT payments immutable and monthly contributions RenShinKan-only", () => {
    const memberships = file("functions/api/admin/memberships.ts");
    const publicContribution = file("functions/api/contributions.ts");
    const adminContribution = file("functions/api/admin/contributions.ts");
    const profileApproval = file(
      "functions/api/admin/students/[id]/profile-status.ts",
    );
    expect(memberships).toContain("INSERT INTO aat_membership_payments");
    expect(memberships).toContain("INSERT INTO payment_history");
    expect(publicContribution.replace(/\s+/g, " ")).toContain(
      'contributionType === "renshinkan_monthly" ? DEFAULT_DOJO_ID',
    );
    expect(publicContribution).toContain("configuredMonthlyContributionAmount");
    expect(publicContribution).toContain("s.dojo_id = ?");
    expect(adminContribution).toContain("requiresCentralAdmin");
    expect(adminContribution).toContain(
      "JOIN students s ON s.id = r.student_id AND s.dojo_id = 'dojo-rsk'",
    );
    expect(adminContribution).toContain(
      "c.student_id = r.student_id AND c.month_key = r.month_key",
    );
    expect(adminContribution).toContain(
      "s.dojo_id = 'dojo-rsk' AND c.status = 'paid'",
    );
    expect(profileApproval).toContain(
      'contributionPeriod && existing.dojo_id === "dojo-rsk"',
    );
  });

  it("enforces dojo scoping in student, application, membership, dashboard, and report APIs", () => {
    for (const path of [
      "functions/api/admin/students/index.ts",
      "functions/api/admin/students/[id].ts",
      "functions/api/admin/memberships.ts",
      "functions/api/admin/dashboard.ts",
      "functions/api/admin/examinations.ts",
      "functions/api/admin/examinations/export.ts",
    ]) {
      expect(file(path)).toMatch(
        /canAccessDojo|isRenShinKanSuperAdmin|assertStudentAccess/,
      );
    }
    const audit = file("functions/api/admin/audit.ts");
    expect(audit).toContain("isRenShinKanSuperAdmin");
    expect(audit).toContain("session.selectedDojoId");
    expect(audit).toContain("scoped_student.dojo_id = ?");
  });
});

describe("examination reports and website editor", () => {
  it("creates a real XLSX package with frozen headers, filters, numeric fees, formulas, and a summary sheet", () => {
    const bytes = buildExamXlsx(
      {
        title: "Exam",
        name: "Exam",
        rank_category: "Kyu",
        examination_at: "2026-06-28",
        venue: "RenShinKan",
        instructions: "",
      },
      [
        {
          public_student_id: "CMU-00001",
          student_name: "ทดสอบ Student",
          dojo_name: "Chiang Mai University Aikido Club",
          dojo_code: "CMU",
          aat_number: null,
          aat_last_paid_date: null,
          current_rank: "5 Kyu",
          attempted_rank: "4 Kyu",
          last_examination_date: null,
          practice_period: "90 days",
          grade_given: "",
          exam_fee: 500,
          aat_annual_fee: 200,
          other_fees: 0,
          total_fee: 700,
          notes: "",
          answers_json: '{"age":24}',
        },
      ],
      "CMU",
    );
    expect([...bytes.slice(0, 2)]).toEqual([80, 75]);
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toContain("xl/worksheets/sheet2.xml");
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain("<autoFilter");
    expect(sheet).toContain("<f>SUM(");
    expect(sheet).toContain("ทดสอบ Student");
  });

  it("scopes both PDF and Excel on the server and embeds a Unicode Thai font", () => {
    const endpoint = file("functions/api/admin/examinations/export.ts");
    const exporter = file("functions/_lib/examExports.ts");
    expect(endpoint).toContain("canAccessDojo");
    expect(endpoint).toContain('format === "xlsx"');
    expect(endpoint).toContain("NotoSansThai.ttf");
    expect(exporter).toContain("registerFontkit");
    expect(exporter).toContain("Page ${pageNumber}");
    expect(endpoint).toContain("All Dojos");
  });

  it("renders a valid landscape Unicode PDF with Thai and English student text", async () => {
    const row = {
      public_student_id: "CMU-00001",
      student_name: "ทดสอบ Student",
      dojo_name: "Chiang Mai University Aikido Club",
      dojo_code: "CMU",
      aat_number: "AAT-7",
      aat_last_paid_date: "2026-01-01",
      current_rank: "5 Kyu",
      attempted_rank: "4 Kyu",
      last_examination_date: "2025-11-30",
      practice_period: "90 days",
      grade_given: "Pass",
      exam_fee: 500,
      aat_annual_fee: 200,
      other_fees: 0,
      total_fee: 700,
      notes: "พร้อม",
      answers_json: '{"age":24}',
    };
    const bytes = await buildExamPdf(
      {
        title: "การสอบ Exam",
        name: "Exam",
        rank_category: "Kyu",
        examination_at: "2026-06-28",
        venue: "RenShinKan",
        instructions: "",
      },
      [row],
      "All Dojos",
      new Uint8Array(
        readFileSync(resolve(root, "public/fonts/NotoSansThai.ttf")),
      ),
      false,
    );
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain("%PDF");
    expect(bytes.length).toBeGreaterThan(5_000);
  });

  it("validates multilingual structured content and strips unsafe destinations", () => {
    const content = validateEditableContent({
      version: 1,
      recentEvents: [],
      examAnnouncement: null,
      historyMedia: [],
      onTheMatMedia: [],
      passedTestStudents: [],
      sitePages: [
        {
          id: "page-home",
          route: "/",
          status: "published",
          translations: { en: { title: "Home" } },
          blocks: [
            {
              id: "block-hero",
              type: "hero",
              translations: {
                en: {
                  title: "Welcome",
                  buttonUrl: "javascript:alert(1)",
                  imageUrl: "https://example.test/image.webp",
                },
              },
            },
          ],
        },
      ],
      siteSettings: {},
    });
    expect(content.sitePages[0].blocks[0].translations.en.buttonUrl).toBe("");
    expect(Object.keys(content.sitePages[0].translations)).toEqual([
      "en",
      "th",
      "ja",
      "zh-CN",
    ]);
  });

  it("limits the editor to central admins and implements draft, preview, publish, revision, and rollback", () => {
    const api = file("functions/api/admin/site-content.ts");
    const ui = file("src/pages/AdminSiteEditorPage.tsx");
    expect(api).toContain("requiresCentralAdmin");
    for (const value of [
      "site_content_drafts",
      "site_revisions",
      'action === "rollback"',
      "publishEditableContent",
    ])
      expect(api).toContain(value);
    for (const value of [
      "Unsaved changes",
      "Draft preview",
      "desktop",
      "tablet",
      "mobile",
      "Save draft",
      "Roll back and publish",
    ])
      expect(ui).toContain(value);
  });
});
