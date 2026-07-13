import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("database safety and audit contracts", () => {
  const migration = file("migrations/0003_student_workflows.sql");

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

  it("protects every administrator mutation server-side", () => {
    const endpoints = ["functions/api/admin/students/index.ts", "functions/api/admin/students/[id].ts", "functions/api/admin/students/[id]/inline.ts", "functions/api/admin/students/[id]/hours.ts", "functions/api/admin/students/[id]/exam.ts", "functions/api/admin/students/bulk.ts", "functions/api/admin/examination/reset.ts"];
    endpoints.forEach((path) => { const source = file(path); expect(source).toContain("hasValidAdminSession"); expect(source).toContain("isSameOriginRequest"); });
  });

  it("logs every new student-data mutation source", () => {
    const all = ["functions/api/records/profile-requests.ts", "functions/api/records/hours.ts", "functions/api/records/examination-applications.ts", "functions/api/admin/students/[id]/inline.ts", "functions/api/admin/students/[id]/hours.ts", "functions/api/admin/students/[id]/exam.ts", "functions/api/admin/students/bulk.ts", "functions/api/admin/students/[id]/application.ts", "functions/api/admin/examination/reset.ts"].map(file).join("\n");
    for (const source of ["student_profile_request", "student_self_service", "student_examination_application", "admin_inline_edit", "admin_student_edit", "admin_bulk_hours", "admin_mass_promotion", "admin_examination_application", "admin_examination_reset"]) expect(all).toContain(source);
  });

  it("prevents duplicate public submissions and mass-action replay", () => {
    for (const path of ["functions/api/records/profile-requests.ts", "functions/api/records/hours.ts", "functions/api/records/examination-applications.ts", "functions/api/admin/students/bulk.ts"]) {
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

  it("requires approved identity, PIN, Turnstile, a higher rank, and one application per cycle", () => {
    expect(application).toContain("profile_status = 'approved'"); expect(application).toContain("verifyStudentPin"); expect(application).toContain("verifyTurnstile"); expect(application).toContain("rankIndex(attemptedRank) <= rankIndex(currentRank)"); expect(application).toContain("already open in the current examination cycle");
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

  it("requires a verified short-lived session and PIN for student hours", () => {
    const hours = file("functions/api/records/hours.ts"); expect(hours).toContain("validStudentAccessSession"); expect(hours).toContain("verifyStudentPin"); expect(hours).toContain("status: \"pending\"");
  });
});

describe("UI and responsive workflow contracts", () => {
  it("removes the decorative background only from administrator routes", () => {
    const app = file("src/App.tsx"); const css = file("src/index.css");
    expect(app).toContain('location.pathname.startsWith("/admin")'); expect(css).toContain("html.admin-route body"); expect(css).toContain("background: #ffffff !important"); expect(css).toContain("html.admin-route main");
  });

  it("provides search, all requested filters, inline editing, bulk previews, and double reset confirmation", () => {
    const admin = file("src/pages/AdminStudentsPage.tsx");
    for (const value of ["profileStatus", "examinationStatus", "paymentStatus", "total_hours", "current_rank", "Add hours", "Mass promotion", "RESET EXAM STATUS"]) expect(admin).toContain(value);
    expect(admin).toContain("onWheel"); expect(admin).toContain('event.key === "Escape"'); expect(admin).toContain("Review changes");
  });

  it("shows three task choices, pending payment, existing bank QR, owner QR tools, and mobile layouts", () => {
    const page = file("src/pages/StudentRecordsPage.tsx"); const css = file("src/index.css");
    for (const text of ["Find my record", "Create a profile", "Apply for an exam", "/images/promptpay-qr.png", "payment status is", "Copy link", "Download QR", "Submit for review"]) expect(page).toContain(text);
    expect(css).toContain(".record-task-picker { display: grid; grid-template-columns: repeat(3, 1fr)"); expect(css).toContain(".record-task-picker { grid-template-columns: 1fr");
  });
});
