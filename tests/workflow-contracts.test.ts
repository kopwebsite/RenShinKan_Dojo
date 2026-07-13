import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("database safety and audit contracts", () => {
  const migration = file("migrations/0003_student_workflows.sql");
  const cycleMigration = file("migrations/0004_student_cycles_and_contributions.sql");
  const operationsMigration = file("migrations/0005_shared_profile_photos.sql");

  it("uses an additive migration and preserves current records and legacy QR tokens", () => {
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX)/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+(students|share_tokens|training_hours|belt_examinations)/i);
    expect(migration).toContain("purpose TEXT NOT NULL DEFAULT 'legacy'");
    expect(migration).toContain("profile_status TEXT NOT NULL DEFAULT 'approved'");
  });

  it("creates private workflow, idempotency, failure, and audit structures", () => {
    for (const name of ["examination_applications", "application_status_history", "training_hour_requests", "student_access_sessions", "admin_login_attempts", "mutation_requests", "operation_failures"]) expect(migration).toContain(`TABLE IF NOT EXISTS ${name}`);
    for (const column of ["actor_type", "previous_values", "new_values", "source", "bulk_operation_id", "request_id"]) expect(migration).toContain(`audit_log ADD COLUMN ${column}`);
  });

  it("adds non-destructive cycle, archive, contribution, snapshot, and history structures", () => {
    expect(cycleMigration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX)/i);
    expect(cycleMigration).not.toMatch(/DELETE\s+FROM\s+(students|share_tokens|training_hours|belt_examinations)/i);
    for (const name of ["exam_cycle_student_status", "exam_cycle_status_history", "contribution_periods", "contribution_period_students", "monthly_contributions", "contribution_status_history", "schema_deprecations"]) {
      expect(cycleMigration).toContain(`TABLE IF NOT EXISTS ${name}`);
    }
    for (const column of ["archived_at", "archived_by", "public_visible_before_archive", "student_name_snapshot", "student_public_id_snapshot"]) expect(cycleMigration).toContain(column);
  });

  it("makes approved QR photos visible and prevents duplicate hours approval", () => {
    expect(operationsMigration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX)/i);
    expect(operationsMigration).toContain("hour_request_id");
    expect(operationsMigration).toContain("idx_training_hours_hour_request");
    expect(operationsMigration).toContain("json('true')");
    const records = file("functions/_lib/studentRecords.ts");
    expect(records).toContain("profileImage: student.profile_image_consent ? student.profile_image_url : null");
  });

  it("protects every administrator mutation server-side", () => {
    const endpoints = ["functions/api/admin/students/index.ts", "functions/api/admin/students/[id].ts", "functions/api/admin/students/[id]/inline.ts", "functions/api/admin/students/[id]/hours.ts", "functions/api/admin/students/[id]/exam.ts", "functions/api/admin/students/bulk.ts", "functions/api/admin/examinations.ts", "functions/api/admin/contributions.ts"];
    endpoints.forEach((path) => { const source = file(path); expect(source).toContain("hasValidAdminSession"); expect(source).toContain("isSameOriginRequest"); });
  });

  it("logs every new student-data mutation source", () => {
    const all = ["functions/api/records/profile-requests.ts", "functions/api/records/hours.ts", "functions/api/records/examination-applications.ts", "functions/api/contributions.ts", "functions/api/admin/students/[id].ts", "functions/api/admin/students/[id]/inline.ts", "functions/api/admin/students/[id]/hours.ts", "functions/api/admin/students/[id]/exam.ts", "functions/api/admin/students/bulk.ts", "functions/api/admin/students/[id]/application.ts", "functions/api/admin/examinations.ts", "functions/api/admin/contributions.ts"].map(file).join("\n");
    for (const source of ["student_profile_request", "student_self_service", "student_examination_application", "monthly_contribution_form", "admin_inline_edit", "admin_student_edit", "admin_bulk_hours", "admin_bulk_hours_approval", "admin_mass_promotion", "admin_examination_application", "admin_exam_applications", "admin_monthly_contributions", "student_archived", "student_restored", "student_permanently_deleted"]) expect(all).toContain(source);
  });

  it("prevents duplicate public submissions and mass-action replay", () => {
    for (const path of ["functions/api/records/profile-requests.ts", "functions/api/records/hours.ts", "functions/api/records/examination-applications.ts", "functions/api/contributions.ts", "functions/api/admin/students/bulk.ts", "functions/api/admin/examinations.ts", "functions/api/admin/contributions.ts"]) {
      const source = file(path); expect(source).toContain("mutation_requests"); expect(source).toContain("requestId");
    }
  });
});

describe("student workflow contracts", () => {
  const application = file("functions/api/records/examination-applications.ts");

  it("saves every applicant questionnaire field from the original PDF", () => {
    for (const key of ["aat_number", "date", "name", "surname", "nationality", "sex", "dob", "age", "permanent_address", "present_address", "tel", "school", "class", "office", "position", "certificate", "games_experience", "applicant_signature", "guarantor_signature", "signature_parenthetical", "official_note"]) expect(application).toContain(`${key}:`);
    expect(application).toContain("official_rank_${index}");
  });

  it("accepts a blank present address and stores a normalized international telephone", () => {
    expect(application).toContain("present_address: text(body.presentAddress, 500)");
    expect(application).toContain("telephone_country");
    expect(application).toContain("normalizeInternationalPhone");
    expect(application).not.toContain("present_address: text(body.presentAddress, 500, true)");
  });

  it("requires approved Student ID plus name, Turnstile, a higher rank, and one application per cycle", () => {
    expect(application).toContain("profile_status = 'approved'"); expect(application).toContain("namesLikelyMatch"); expect(application).toContain("verifyTurnstile"); expect(application).toContain("rankIndex(attemptedRank) <= rankIndex(currentRank)"); expect(application).toContain("already open in the current examination cycle");
    expect(application).not.toContain("verifyStudentPin");
  });

  it("keeps pending profiles private until an administrator approves them", () => {
    const submit = file("functions/api/records/profile-requests.ts"); const approval = file("functions/api/admin/students/[id]/profile-status.ts");
    expect(submit).toContain("'pending_admin_approval'"); expect(submit).toContain("NULL, 1, 0, 0, 0");
    expect(approval).toContain("profile_status = 'approved', active = 1, public_visible = 1"); expect(approval).toContain("profile_status = 'rejected', active = 0, public_visible = 0");
  });

  it("preserves old QR destinations while adding owner-share links", () => {
    const records = file("functions/_lib/studentRecords.ts"); const lookup = file("functions/api/records/lookup.ts");
    expect(records).toContain("purpose = 'owner'"); expect(records).not.toContain("UPDATE share_tokens SET active = 0"); expect(lookup).toContain("ensureOwnerShareUrl");
  });

  it("requires a one-use short-lived lookup session for student hours without a second credential", () => {
    const hours = file("functions/api/records/hours.ts"); expect(hours).toContain("validStudentAccessSession"); expect(hours).toContain("student_access_sessions SET used_at"); expect(hours).not.toContain("verifyStudentPin"); expect(hours).toContain("status: \"pending\"");
  });

  it("records a contribution attempt as awaiting payment and never as paid", () => {
    const contribution = file("functions/api/contributions.ts");
    expect(contribution).toContain("namesLikelyMatch");
    expect(contribution).toContain("'awaiting_payment'");
    expect(contribution).toContain("contribution_period_students");
    expect(contribution).not.toContain("status, 'paid'");
  });
});

describe("UI and responsive workflow contracts", () => {
  it("removes the decorative background only from administrator routes", () => {
    const app = file("src/App.tsx"); const css = file("src/index.css");
    expect(app).toContain('location.pathname.startsWith("/admin")'); expect(css).toContain("html.admin-route body"); expect(css).toContain("background: #ffffff !important"); expect(css).toContain("html.admin-route main");
  });

  it("separates students, examination cycles, and monthly contributions into focused workspaces", () => {
    const admin = file("src/pages/AdminStudentsPage.tsx");
    const exams = file("src/components/admin/AdminExamApplications.tsx");
    const contributions = file("src/components/admin/AdminMonthlyContributions.tsx");
    for (const value of ["Student Database", "Exam Applications", "Monthly Contributions", "current_rank", "Add hours", "Approve pending hours", "Mass promotion", "Confirm archive", "Confirm restore", "Delete permanently"]) expect(admin).toContain(value);
    for (const value of ["Start New Exam Cycle", "Not signed up", "Read-only historical cycle", "Confirm status change"]) expect(exams).toContain(value);
    for (const value of ["Awaiting payment", "Paid rate", "Last 12 months", "Internal note", "Accessible monthly contribution totals"]) expect(contributions).toContain(value);
    expect(admin).toContain("onWheel"); expect(admin).toContain("Review changes");
    expect(admin).toContain("admin-select-box"); expect(admin).toContain("DELETE ${studentAction.student.public_student_id}");
  });

  it("shows three task choices, pending payment, existing bank QR, owner QR tools, and mobile layouts", () => {
    const page = file("src/pages/StudentRecordsPage.tsx"); const css = file("src/index.css");
    for (const text of ["Find my record", "Create a profile", "Apply for an exam", "/images/promptpay-qr.png", "payment status is", "Copy link", "Download QR", "Submit for review"]) expect(page).toContain(text);
    expect(css).toContain(".record-task-picker { display: grid; grid-template-columns: repeat(3, 1fr)"); expect(css).toContain(".record-task-picker { grid-template-columns: 1fr");
  });

  it("uses an optional present address and country-aware telephone control", () => {
    const page = file("src/pages/StudentRecordsPage.tsx");
    for (const value of ["Leave blank if same as permanent address", "Telephone country / calling code", "PHONE_COUNTRIES", "tel-national"]) expect(page).toContain(value);
    expect(page).not.toMatch(/Present address<[^>]*>.*required/);
  });

  it("keeps personal exam answers out of persistent browser storage and removes the retired extra credential", () => {
    const studentPage = file("src/pages/StudentRecordsPage.tsx");
    const allLiveSource = [
      "src/pages/StudentRecordsPage.tsx", "src/pages/AdminStudentsPage.tsx",
      "functions/api/records/lookup.ts", "functions/api/records/hours.ts",
      "functions/api/records/profile-requests.ts", "functions/api/records/examination-applications.ts",
      "functions/api/admin/students/index.ts", "functions/api/admin/students/[id].ts",
    ].map(file).join("\n");
    expect(studentPage).not.toContain("localStorage");
    expect(allLiveSource).not.toMatch(/student[_ -]?pin/i);
  });

  it("uses the existing PromptPay QR, records an attempt first, and displays original dojo artwork", () => {
    const form = file("src/components/ContributionForm.tsx");
    const support = file("src/pages/SupportPage.tsx");
    for (const value of ["/api/contributions", "/images/promptpay-qr.png", "awaiting payment", "Displaying this QR code does not mean", "Send your payment proof"]) expect(form).toContain(value);
    expect(support).toContain("support-dojo-art");
    expect(support).not.toContain("/dojo-photos/support.avif");
  });
});
