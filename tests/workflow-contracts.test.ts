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
    const endpoints = ["functions/api/admin/students/index.ts", "functions/api/admin/students/upload.ts", "functions/api/admin/students/[id].ts", "functions/api/admin/students/[id]/inline.ts", "functions/api/admin/students/[id]/hours.ts", "functions/api/admin/students/[id]/exam.ts", "functions/api/admin/students/bulk.ts", "functions/api/admin/examinations.ts", "functions/api/admin/contributions.ts"];
    endpoints.forEach((path) => { const source = file(path); expect(source).toMatch(/getAdminSession|getAuthorizedAdminSession|hasValidAdminSession/); expect(source).toContain("isSameOriginRequest"); });
  });

  it("logs every new student-data mutation source", () => {
    const all = ["functions/api/records/profile-requests.ts", "functions/api/records/hours.ts", "functions/api/records/examination-applications.ts", "functions/api/contributions.ts", "functions/api/admin/students/[id].ts", "functions/api/admin/students/[id]/inline.ts", "functions/api/admin/students/[id]/hours.ts", "functions/api/admin/students/[id]/exam.ts", "functions/api/admin/students/bulk.ts", "functions/api/admin/students/[id]/application.ts", "functions/api/admin/examinations.ts", "functions/api/admin/contributions.ts"].map(file).join("\n");
    for (const source of ["student_profile_request", "student_self_service", "student_examination_application", "monthly_contribution_form", "admin_inline_edit", "admin_student_edit", "admin_bulk_hours", "admin_bulk_hours_approval", "admin_mass_promotion", "admin_examination_application", "admin_exam_applications", "admin_monthly_contributions", "student_archived", "student_restored", "student_soft_deleted"]) expect(all).toContain(source);
  });

  it("prevents duplicate public submissions and mass-action replay", () => {
    for (const path of ["functions/api/records/profile-requests.ts", "functions/api/records/hours.ts", "functions/api/records/examination-applications.ts", "functions/api/contributions.ts", "functions/api/admin/students/bulk.ts", "functions/api/admin/examinations.ts", "functions/api/admin/contributions.ts"]) {
      const source = file(path); expect(source).toContain("mutation_requests"); expect(source).toContain("requestId");
    }
  });
});

describe("student workflow contracts", () => {
  const application = file("functions/api/records/examination-applications.ts");

  it("saves the revised applicant questionnaire without guarantor fields", () => {
    for (const key of ["aat_number", "date", "name", "surname", "nationality", "sex", "dob", "age", "permanent_address", "present_address", "tel", "school", "class", "office", "position", "certificate", "games_experience", "applicant_signature", "official_note"]) expect(application).toContain(`${key}:`);
    expect(application).not.toContain("guarantor_signature");
    expect(application).not.toContain("signature_parenthetical");
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

  it("keeps pending profiles private and permits an optional photo until an administrator approves them", () => {
    const submit = file("functions/api/records/profile-requests.ts"); const approval = file("functions/api/admin/students/[id]/profile-status.ts");
    expect(submit).toContain("'pending_admin_approval'"); expect(submit).toContain("NULL, ?, 0, 0, 0");
    expect(submit).toContain("file ? 1 : 0"); expect(submit).toContain("pendingKey || null");
    expect(submit).toContain("const dojoId = clean(payload.dojoId");
    expect(submit).toContain("Choose the dojo where the student currently trains");
    expect(submit).toContain("dojo.official_name"); expect(submit).toContain("dojo.id, aatNumber");
    expect(approval).toContain("let approvedImageUrl = existing.profile_image_url");
    expect(approval).toContain("if (existing.pending_profile_image_key)");
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
    for (const value of ["Student Database", "Exam Applications", "Monthly Contributions", "current_rank", "Add hours", "Approve pending hours", "Mass promotion", "Confirm archive", "Confirm restore", "Confirm soft-delete"]) expect(admin).toContain(value);
    for (const value of ["Start New Exam Cycle", "Not signed up", "Read-only historical cycle", "Confirm status change"]) expect(exams).toContain(value);
    for (const value of ["Awaiting payment", "Paid rate", "Last 12 months", "Internal note", "Accessible monthly contribution totals"]) expect(contributions).toContain(value);
    expect(admin).toContain("onWheel"); expect(admin).toContain("Review changes");
    expect(admin).toContain("admin-select-box"); expect(admin).toContain("DELETE ${studentAction.student.public_student_id}");
  });

  it("shows compact status-aware selection actions and scopes normal bulk work to active students", () => {
    const admin = file("src/pages/AdminStudentsPage.tsx");
    const bulk = file("functions/api/admin/students/bulk.ts");
    const student = file("functions/api/admin/students/[id].ts");
    for (const value of ["selectedActiveRows", "selectedPendingProfiles", "selectedArchivedRows", "Only eligible selected records were changed", "Unarchive", "Deny pending profiles", "Delete archived students"]) expect(admin).toContain(value);
    expect(admin).toContain('const targets = bulk.type === "approve_hours" ? selectedPendingRows : selectedActiveRows');
    expect(admin).toContain('student.profile_status === "pending_admin_approval" ? <Status value={student.profile_status} />');
    expect(bulk).toContain('student.active !== 1 || student.archived_at || student.profile_status !== "approved"');
    expect(student).toContain('Only an archived student can be deleted.');
  });

  it("supports compact AAT membership selection and collapses empty payment history", () => {
    const memberships = file("src/components/admin/AdminAatMemberships.tsx");
    const css = file("src/index.css");
    for (const value of ["selectedIds", "Select all visible AAT memberships", "Select AAT membership for", "openPayment(selectedRows)", "Each student keeps their existing AAT membership number", "No payments"]) expect(memberships).toContain(value);
    expect(memberships).toContain("row.history.length ? <details");
    expect(css).toContain(".admin-aat-history-empty");
    expect(css).toContain(".admin-aat-bulk-bar");
  });

  it("records optional training locations and administrator-selected examination dates", () => {
    const admin = file("src/pages/AdminStudentsPage.tsx");
    const hours = file("functions/api/admin/students/[id]/hours.ts");
    const exam = file("functions/api/admin/students/[id]/exam.ts");
    const bulk = file("functions/api/admin/students/bulk.ts");
    const detail = file("functions/api/admin/students/[id].ts");
    const migration = file("migrations/0009_training_hour_locations.sql");
    for (const value of ["Training location", "hoursLocation", "training_location", "Examination date", "examinationDate", "formatDay(entry.entry_date", "formatDay(entry.examination_date"]) expect(admin).toContain(value);
    expect(hours).toContain("Training location must be 200 characters or fewer.");
    expect(hours).toContain("training_location");
    expect(detail).toContain("training_location");
    expect(migration).toContain("ADD COLUMN training_location TEXT");
    expect(exam).toContain("Choose a valid examination date.");
    expect(exam).toContain(".bind(examId, studentId, examinationDate");
    expect(bulk).toContain("training_location");
  });

  it("shows three task choices, pending payment, existing bank QR, owner QR tools, and mobile layouts", () => {
    const page = file("src/pages/StudentRecordsPage.tsx"); const css = file("src/index.css");
    for (const text of ["Find my record", "Create a profile", "Apply for an exam", "/images/promptpay-qr.png", "cannot confirm your payment", "Copy link", "Download QR", "Submit for review"]) expect(page).toContain(text);
    expect(page).toContain("Current dojo");
    expect(page).not.toMatch(/guarantor/i);
    expect(css).toContain(".record-task-picker { display: grid; grid-template-columns: repeat(3, 1fr)"); expect(css).toContain(".record-task-picker { grid-template-columns: 1fr");
  });

  it("lets administrators prepare and upload an optional student profile photo", () => {
    const admin = file("src/pages/AdminStudentsPage.tsx");
    const upload = file("functions/api/admin/students/upload.ts");
    for (const value of ["prepareProfilePhoto", "/api/admin/students/upload", "profileImageUrl", "profileImageConsent", "Add profile photo (optional)"]) expect(admin).toContain(value);
    expect(upload).toContain("onRequestDelete");
    expect(upload).toContain("await env.MEDIA_BUCKET.delete(key)");
  });

  it("uses an optional present address and country-aware telephone control", () => {
    const page = file("src/pages/StudentRecordsPage.tsx");
    for (const value of ["Leave blank if it is the same as your permanent address", "Country calling code", "PHONE_COUNTRIES", "tel-national"]) expect(page).toContain(value);
    expect(page).not.toMatch(/Current address<[^>]*>.*required/);
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
    for (const value of ["/api/contributions", "/images/promptpay-qr.png", "awaiting payment", "Displaying this QR code does not mean", "Upload your payslip below"]) expect(form).toContain(value);
    expect(support).toContain("support-dojo-art");
    expect(support).not.toContain("/dojo-photos/support.avif");
  });

  it("requires private payslip submission after each PromptPay flow", () => {
    const upload = file("src/components/PaymentProofUpload.tsx");
    const contributions = file("src/components/ContributionForm.tsx");
    const records = file("src/pages/StudentRecordsPage.tsx");
    const examApi = file("functions/api/records/examination-applications.ts");
    const contributionApi = file("functions/api/contributions.ts");
    for (const value of ["The dojo cannot confirm your", "send it directly to a sensei of RenShinKan Dojo", "automatically deleted after 60 days", "/api/payment-proofs"]) expect(upload).toContain(value);
    expect(contributions).toContain("PaymentProofUpload");
    expect(records).toContain("PaymentProofUpload");
    for (const source of [examApi, contributionApi]) {
      expect(source).toContain("createPaymentProofDraft");
      expect(source).toContain("proofId");
      expect(source).toContain("uploadToken");
    }
  });

  it("provides scoped individual and bulk payslip review with 60-day private retention", () => {
    const migration = file("migrations/0010_payment_proofs.sql");
    const uploadApi = file("functions/api/payment-proofs.ts");
    const adminApi = file("functions/api/admin/payment-proofs.ts");
    const imageApi = file("functions/api/admin/payment-proofs/[id].ts");
    const adminPage = file("src/pages/AdminStudentsPage.tsx");
    const adminProofs = file("src/components/admin/AdminPaymentProofs.tsx");
    const packageJson = file("package.json");
    expect(migration).toContain("TABLE IF NOT EXISTS payment_proofs");
    expect(migration).toContain("'exam', 'aat_annual', 'renshinkan_monthly'");
    expect(uploadApi).toContain("paymentProofExpiry");
    expect(uploadApi).toContain("payment-proofs/");
    expect(adminApi).toContain("isRenShinKanSuperAdmin");
    expect(adminApi).toContain("s.dojo_id = ?");
    expect(adminApi).toContain("pending_review");
    expect(adminApi).toContain('action === "approve"');
    expect(adminApi).toContain('action === "deny"');
    expect(imageApi).toContain('"Cache-Control": "private, no-store"');
    expect(adminPage).toContain("Submitted Payslip");
    for (const value of ["Select every pending payslip", "Approve payslip", "Deny payslip", "Payslip submitted by", "Payment for"]) expect(adminProofs).toContain(value);
    expect(packageJson).toContain("payment-proofs-60-days payment-proofs/ --expire-days 60");
  });
});
