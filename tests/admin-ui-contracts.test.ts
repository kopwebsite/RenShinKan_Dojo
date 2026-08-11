import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => readFileSync(resolve(root, path), "utf8");
const compact = (value: string) => value.replace(/\s+/g, " ");

describe("unified administration UI contracts", () => {
  it("uses the role-aware shell for every administration route", () => {
    const app = file("src/App.tsx");
    const shell = file("src/components/admin/AdminShell.tsx");

    expect(app).toContain("<AdminShell>");
    expect(app).toContain('path="/admin" element={<AdminDashboardPage />}');
    expect(app).toContain(
      'path="/admin/dashboard" element={<AdminDashboardPage />}',
    );
    expect(app).toContain('path="/admin/website" element={<AdminPage />}');
    expect(compact(app)).toContain(
      'path="/admin/profile-requests" element={<AdminStudentsPage mode="profileRequests" />}',
    );
    expect(compact(app)).toContain(
      'path="/admin/examination-records" element={<AdminWorkflowPage kind="examination-records" />}',
    );
    expect(shell).toContain('permissionLevel === "renshinkan_super_admin"');
    expect(shell).toContain("centralOnly");
    expect(shell).toContain('href: "/admin/profile-requests"');
    expect(shell).not.toContain("renshinkanVerificationRequired");
    expect(shell).toContain("<strong>{dataScope}</strong>");
    expect(shell).toContain('href: "/admin/exam-payslips"');
    expect(shell).not.toContain("changeDojo");
  });

  it("keeps student workflows task-first and preserves browser history", () => {
    const students = file("src/pages/AdminStudentsPage.tsx");
    const records = file("src/pages/StudentRecordsPage.tsx");
    const passport = file("src/components/studentPassport/DigitalPassport.tsx");

    expect(students).toContain("admin-student-workspace__tabs");
    expect(students).toContain('role="tablist"');
    expect(students).toContain("admin-payment-history");
    expect(students).toContain("No payment records yet");
    expect(students).toContain("Review and record examination");
    expect(students).toContain("window.confirm");
    for (const heading of [
      "Student",
      "Student ID",
      "Rank",
      "Status",
      "Training hours",
      "Action",
    ]) {
      expect(students).toContain(`<th>${heading}</th>`);
    }
    expect(students).toContain("<Eye size={14} /> Open record");
    expect(students).toContain(
      'admin.permissionLevel !== "renshinkan_super_admin"',
    );
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

  it("keeps the Admin Auggie panel copy honest and free of the old blurb", () => {
    const panel = file("src/components/admin/AdminAuggiePanel.tsx");
    // The old, now-inaccurate blurb must be gone in both languages.
    expect(panel).not.toContain("Only your first request is sent to AI");
    expect(panel).not.toContain(
      "Auggie can never open private files or upload media",
    );
    expect(panel).not.toContain("ส่งให้ AI เฉพาะคำขอแรกของคุณ");
    expect(panel).not.toContain("Auggie ไม่สามารถเปิดไฟล์ส่วนตัวหรืออัปโหลดสื่อได้");
    // The honest copy names the confirmation rail and the second phrase.
    expect(panel).toContain("type the exact confirmation phrase yourself");
    expect(panel).toContain("need a second phrase");
    // The disclosure names the bounded student reference that can reach the
    // model and the richer records that are deliberately excluded.
    expect(panel).toContain("place name to a weather service");
    expect(compact(panel)).toContain(
      "Those references can include a student name, Student ID, dojo, and status",
    );
    expect(compact(panel)).toContain(
      "Full database rows, files, proof images, questionnaire answers, and private notes are not added",
    );
    expect(panel).not.toContain(
      "Nothing about your students, records or money is ever sent to AI",
    );
    // Example asks are shown when the panel is empty, in both languages.
    expect(panel).toContain("examplesTitle");
    expect(panel).toContain("items.length === 0");
    expect(panel).toContain("Find Student ID RSK-1001");
    expect(panel).toContain("ลองถามดู");
    expect(panel).toContain("บริการพยากรณ์อากาศ");
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
