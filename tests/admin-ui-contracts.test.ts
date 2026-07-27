import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("unified administration UI contracts", () => {
  it("uses the role-aware shell for every administration route", () => {
    const app = file("src/App.tsx");
    const shell = file("src/components/admin/AdminShell.tsx");

    expect(app).toContain("<AdminShell>");
    expect(app).toContain('path="/admin" element={<AdminDashboardPage />}');
    expect(app).toContain('path="/admin/website" element={<AdminPage />}');
    expect(app).toContain('path="/admin/profile-requests" element={<AdminStudentsPage mode="profileRequests" />}');
    expect(app).toContain('path="/admin/examination-records" element={<AdminWorkflowPage kind="examination-records" />}');
    expect(shell).toContain("permissionLevel === \"renshinkan_super_admin\"");
    expect(shell).toContain("centralOnly");
    expect(shell).toContain('href: "/admin/profile-requests"');
    expect(shell).toContain("renshinkanVerificationRequired");
  });

  it("keeps student workflows task-first and preserves browser history", () => {
    const students = file("src/pages/AdminStudentsPage.tsx");
    const records = file("src/pages/StudentRecordsPage.tsx");
    const passport = file("src/components/studentPassport/DigitalPassport.tsx");

    expect(students).toContain("admin-student-workspace__tabs");
    expect(students).toContain("Review and record examination");
    expect(students).toContain("window.confirm");
    expect(students).toContain("<th>Student</th><th>Student ID</th><th>Rank</th><th>Status</th><th>Training hours</th><th>Action</th>");
    expect(students).toContain("<Eye size={14} /> Open record");
    expect(students).toContain('if (admin && admin.permissionLevel !== "renshinkan_super_admin"');
    expect(records).toContain("window.history.pushState");
    expect(records).toContain('window.addEventListener("popstate"');
    expect(passport).toContain('role="tablist"');
    expect(passport).toContain('onKeyDown={(event) =>');
    expect(passport).toContain('event.key === "Home"');
    expect(passport).toContain('event.key === "End"');
    expect(passport).toContain('const OWNER_TABS');
    expect(passport).not.toContain("StudentTaskList");
  });

  it("always shows the requested monthly contribution graph, including sparse history", () => {
    const contributions = file("src/components/admin/AdminMonthlyContributions.tsx");
    expect(contributions).toContain('className="contribution-chart"');
    expect(contributions).toContain("data.graph.map");
    expect(contributions).toContain("Accessible monthly contribution totals");
    expect(contributions).not.toContain("meaningfulHistory.length >= 3");
  });

  it("keeps names and official dates editable throughout the student workflow", () => {
    const students = file("src/pages/AdminStudentsPage.tsx");
    const profile = file("src/pages/StudentRecordsPage.tsx");
    const migration = file("migrations/0017_student_names_and_dates.sql");
    const passport = file("src/components/studentPassport/DigitalPassport.tsx");
    for (const value of ["English name", "Thai name", "Account created date", "Joined dojo date"]) expect(students).toContain(value);
    expect(profile).toContain('name="englishName"');
    expect(profile).toContain('name="thaiName"');
    for (const column of ["english_name", "thai_name", "account_created_date", "dojo_joined_date"]) expect(migration).toContain(column);
    expect(passport).toContain("owner.accountCreatedDate");
    expect(passport).toContain("owner.dojoJoinedDate");
  });

  it("keeps all new shell, dashboard, and student task translations in parity", () => {
    const languages = ["en", "th", "ja", "zh-CN"].map((language) =>
      JSON.parse(file(`src/i18n/${language}.json`)) as Record<"adminShell" | "adminDashboard" | "studentTasks", Record<string, string>>,
    );

    for (const section of ["adminShell", "adminDashboard", "studentTasks"] as const) {
      const expectedKeys = Object.keys(languages[0][section]).sort();
      for (const dictionary of languages) {
        expect(Object.keys(dictionary[section]).sort()).toEqual(expectedKeys);
        expect(Object.values(dictionary[section]).every((value) => value.trim().length > 0)).toBe(true);
      }
    }
  });
});
