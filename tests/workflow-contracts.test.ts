import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => readFileSync(resolve(root, path), "utf8");
const compact = (value: string) => value.replace(/\s+/g, " ");

describe("database safety and audit contracts", () => {
  const migration = file("migrations/0003_student_workflows.sql");
  const cycleMigration = file(
    "migrations/0004_student_cycles_and_contributions.sql",
  );
  const operationsMigration = file("migrations/0005_shared_profile_photos.sql");
  const contributionGroupMigration = file(
    "migrations/0012_monthly_contribution_groups.sql",
  );
  const requestsMigration = file(
    "migrations/0013_requests_notices_security.sql",
  );
  const examDecisionGuards = file("migrations/0014_exam_decision_guards.sql");
  const examCompletionGuard = file("migrations/0015_exam_completion_guard.sql");
  const legacyArchiveBackfill = file(
    "migrations/0016_backfill_legacy_archives.sql",
  );

  it("uses an additive migration and preserves current records and legacy QR tokens", () => {
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX)/i);
    expect(migration).not.toMatch(
      /DELETE\s+FROM\s+(students|share_tokens|training_hours|belt_examinations)/i,
    );
    expect(migration).toContain("purpose TEXT NOT NULL DEFAULT 'legacy'");
    expect(migration).toContain(
      "profile_status TEXT NOT NULL DEFAULT 'approved'",
    );
  });

  it("creates private workflow, idempotency, failure, and audit structures", () => {
    for (const name of [
      "examination_applications",
      "application_status_history",
      "training_hour_requests",
      "student_access_sessions",
      "admin_login_attempts",
      "mutation_requests",
      "operation_failures",
    ])
      expect(migration).toContain(`TABLE IF NOT EXISTS ${name}`);
    for (const column of [
      "actor_type",
      "previous_values",
      "new_values",
      "source",
      "bulk_operation_id",
      "request_id",
    ])
      expect(migration).toContain(`audit_log ADD COLUMN ${column}`);
  });

  it("adds non-destructive cycle, archive, contribution, snapshot, and history structures", () => {
    expect(cycleMigration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX)/i);
    expect(cycleMigration).not.toMatch(
      /DELETE\s+FROM\s+(students|share_tokens|training_hours|belt_examinations)/i,
    );
    for (const name of [
      "exam_cycle_student_status",
      "exam_cycle_status_history",
      "contribution_periods",
      "contribution_period_students",
      "monthly_contributions",
      "contribution_status_history",
      "schema_deprecations",
    ]) {
      expect(cycleMigration).toContain(`TABLE IF NOT EXISTS ${name}`);
    }
    for (const column of [
      "archived_at",
      "archived_by",
      "public_visible_before_archive",
      "student_name_snapshot",
      "student_public_id_snapshot",
    ])
      expect(cycleMigration).toContain(column);
  });

  it("makes approved QR photos visible and prevents duplicate hours approval", () => {
    expect(operationsMigration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX)/i);
    expect(operationsMigration).toContain("hour_request_id");
    expect(operationsMigration).toContain("idx_training_hours_hour_request");
    expect(operationsMigration).toContain("json('true')");
    const records = file("functions/_lib/studentRecords.ts");
    expect(records.replace(/\s+/g, " ")).toContain(
      "profileImage: student.profile_image_consent ? student.profile_image_url : null",
    );
  });

  it("adds non-destructive shared monthly-payment grouping", () => {
    expect(contributionGroupMigration).not.toMatch(
      /\bDROP\s+(TABLE|COLUMN|INDEX)/i,
    );
    expect(contributionGroupMigration).not.toMatch(
      /DELETE\s+FROM\s+(students|monthly_contributions|payment_proofs)/i,
    );
    expect(contributionGroupMigration).toContain("payment_group_id");
    expect(contributionGroupMigration).toContain("expected_amount");
    expect(contributionGroupMigration).toContain(
      "idx_monthly_contributions_payment_group",
    );
  });

  it("separates public and private decisions and guards concurrent examination outcomes", () => {
    expect(requestsMigration).not.toMatch(
      /DELETE\s+FROM\s+(students|payments|monthly_contributions|payment_proofs|examination_applications)/i,
    );
    for (const value of [
      "student_visible_note",
      "internal_admin_note",
      "request_decisions",
      "revoked_admin_sessions",
    ])
      expect(requestsMigration).toContain(value);
    expect(examDecisionGuards).toContain(
      "trg_exam_denial_requires_open_application",
    );
    expect(examDecisionGuards).toContain(
      "trg_rejected_exam_cannot_be_marked_paid",
    );
    expect(examCompletionGuard).toContain(
      "trg_denied_exam_cannot_be_completed",
    );
  });

  it("repairs only audit-proven legacy archives without deleting student history", () => {
    expect(legacyArchiveBackfill).not.toMatch(/\bDELETE\b|\bDROP\b/i);
    expect(legacyArchiveBackfill).toContain(
      "action IN ('profile_deactivated', 'student_archived')",
    );
    expect(legacyArchiveBackfill).toContain("active = 0");
    expect(legacyArchiveBackfill).toContain("archived_at IS NULL");
    expect(legacyArchiveBackfill).toContain("AND EXISTS");
  });

  it("protects every administrator mutation server-side", () => {
    const endpoints = [
      "functions/api/admin/students/index.ts",
      "functions/api/admin/students/upload.ts",
      "functions/api/admin/students/[id].ts",
      "functions/api/admin/students/[id]/inline.ts",
      "functions/api/admin/students/[id]/hours.ts",
      "functions/api/admin/students/[id]/exam.ts",
      "functions/api/admin/students/bulk.ts",
      "functions/api/admin/examinations.ts",
      "functions/api/admin/examinations/[applicationId].ts",
      "functions/api/admin/contributions.ts",
      "functions/api/admin/audit-cleanup.ts",
    ];
    endpoints.forEach((path) => {
      const source = file(path);
      expect(source).toMatch(
        /getAdminSession|getAuthorizedAdminSession|hasValidAdminSession/,
      );
      expect(source).toContain("isSameOriginRequest");
    });
  });

  it("logs every new student-data mutation source", () => {
    const all = [
      "functions/api/records/profile-requests.ts",
      "functions/api/records/hours.ts",
      "functions/api/records/examination-applications.ts",
      "functions/api/contributions.ts",
      "functions/api/admin/students/[id].ts",
      "functions/api/admin/students/[id]/inline.ts",
      "functions/api/admin/students/[id]/hours.ts",
      "functions/api/admin/students/[id]/exam.ts",
      "functions/api/admin/students/bulk.ts",
      "functions/api/admin/students/[id]/application.ts",
      "functions/api/admin/examinations.ts",
      "functions/api/admin/contributions.ts",
    ]
      .map(file)
      .join("\n");
    for (const source of [
      "student_profile_request",
      "student_self_service",
      "student_examination_application",
      "monthly_contribution_form",
      "admin_inline_edit",
      "admin_student_edit",
      "admin_bulk_hours",
      "admin_bulk_hours_approval",
      "admin_mass_rank_change",
      "admin_mass_exam_pass",
      "admin_examination_application",
      "admin_exam_applications",
      "admin_monthly_contributions",
      "student_archived",
      "student_restored",
      "student_permanently_deleted",
    ])
      expect(all).toContain(source);
  });

  it("prevents duplicate public submissions and mass-action replay", () => {
    for (const path of [
      "functions/api/records/profile-requests.ts",
      "functions/api/records/hours.ts",
      "functions/api/records/examination-applications.ts",
      "functions/api/contributions.ts",
      "functions/api/admin/students/bulk.ts",
      "functions/api/admin/examinations.ts",
      "functions/api/admin/contributions.ts",
    ]) {
      const source = file(path);
      expect(source).toContain("mutation_requests");
      expect(source).toContain("requestId");
    }
  });
});

describe("student workflow contracts", () => {
  const application = file("functions/api/records/examination-applications.ts");

  it("saves the revised applicant questionnaire without guarantor fields", () => {
    for (const key of [
      "aat_number",
      "date",
      "dojo_name",
      "name",
      "surname",
      "nationality",
      "sex",
      "dob",
      "age",
      "permanent_address",
      "present_address",
      "tel",
      "occupation_type",
      "school",
      "class",
      "office",
      "position",
      "certificate",
      "games_experience",
      "applicant_signature",
      "official_note",
    ])
      expect(application).toContain(`${key}:`);
    expect(application).not.toContain("guarantor_signature");
    expect(application).not.toContain("signature_parenthetical");
    expect(application).toContain("official_rank_${index}");
  });

  it("accepts a blank present address and stores a normalized international telephone", () => {
    expect(application).toContain(
      "present_address: text(body.presentAddress, 500)",
    );
    expect(application).toContain("telephone_country");
    expect(application).toContain("normalizeInternationalPhone");
    expect(application).not.toContain(
      "present_address: text(body.presentAddress, 500, true)",
    );
  });

  it("requires a usable Student ID plus name, Turnstile, a higher rank, and one application per cycle", () => {
    expect(application).toContain("profile_status IN ('pending_admin_approval', 'approved')");
    expect(application).toContain("student_id_aliases");
    expect(application).toContain("namesLikelyMatch");
    expect(application).toContain("verifyTurnstile");
    expect(application).toContain(
      "rankIndex(attemptedRank) <= rankIndex(currentRank)",
    );
    expect(application).toContain(
      "already open in the current examination cycle",
    );
    expect(application).not.toContain("verifyStudentPin");
  });

  it("validates dojo affiliation and conditionally requires relevant school or employment answers", () => {
    const page = file("src/pages/StudentRecordsPage.tsx");
    expect(application).toContain("submittedDojoId !== student.dojo_id");
    expect(application).toContain(
      "The selected dojo does not match this approved student record",
    );
    expect(application).toContain("OCCUPATION_LABELS");
    expect(application).toContain("text(body.school, 160, studies)");
    expect(application).toContain("text(body.office, 160, employed)");
    expect(application).toContain(
      "const gamesExperience = text(body.gamesExperience, 1000)",
    );
    expect(application).not.toContain("text(body.gamesExperience, 1000, true)");
    for (const value of [
      "Current dojo",
      "School or employment status",
      "Student and employed",
      "Not currently studying or employed",
      "exam-field-copy",
      "exam-requirement-key",
    ])
      expect(page).toContain(value);
  });

  it("makes pending profiles usable immediately and permits an optional photo until review", () => {
    const submit = file("functions/api/records/profile-requests.ts");
    const approval = file(
      "functions/api/admin/students/[id]/profile-status.ts",
    );
    expect(submit).toContain("'pending_admin_approval'");
    expect(submit).toContain("NULL, ?, 0, 1, 1");
    expect(submit).toContain("completedProfileResponse");
    expect(submit).toContain("studentName: englishName");
    expect(submit).toContain("mutation_requests");
    expect(submit).toContain("file ? 1 : 0");
    expect(submit).toContain("pendingKey || null");
    expect(submit).toContain("const dojoId = clean(payload.dojoId");
    expect(submit).toContain(
      "Choose the dojo where the student currently trains",
    );
    expect(submit).toContain("dojo.official_name");
    expect(submit).toContain("dojo.id, aatNumber");
    expect(approval).toContain(
      "let approvedImageUrl = existing.profile_image_url",
    );
    expect(approval).toContain("if (existing.pending_profile_image_key)");
    expect(approval).toContain(
      "profile_status = 'approved', active = 1, public_visible = 1",
    );
    expect(approval).toContain(
      "profile_status = 'rejected', active = 0, public_visible = 0",
    );
  });

  it("preserves old QR destinations while adding owner-share links", () => {
    const records = file("functions/_lib/studentRecords.ts");
    const lookup = file("functions/api/records/lookup.ts");
    const share = file("functions/api/records/share/[token].ts");
    expect(records).toContain("purpose = 'owner'");
    expect(records).not.toContain("UPDATE share_tokens SET active = 0");
    expect(lookup).toContain("ensureOwnerShareUrl");
    expect(lookup).toContain("student_id_aliases");
    expect(lookup).toContain("a.alias_public_student_id = ?");
    expect(lookup).not.toContain("student_private_access");
    expect(share).toContain("s.profile_status");
    expect(share).toContain("profile_status IN ('pending_admin_approval', 'approved')");
  });

  it("keeps passport payment and request ledgers behind verified owner lookup", () => {
    const records = file("functions/_lib/studentRecords.ts");
    const lookup = file("functions/api/records/lookup.ts");
    const share = file("functions/api/records/share/[token].ts");
    const ownerBuilder = records.slice(
      records.indexOf("export async function ownerStudentRecord"),
      records.indexOf("export function genericLookupFailure"),
    );
    expect(lookup).toContain("verifyTurnstile");
    expect(lookup).toContain("namesLikelyMatch");
    expect(lookup).toContain("ownerStudentRecord(db, student)");
    expect(share).toContain("publicStudentRecord(db, student)");
    expect(share).not.toContain("ownerStudentRecord");
    for (const table of [
      "training_hours",
      "aat_membership_payments",
      "monthly_contributions",
      "training_hour_requests",
    ])
      expect(ownerBuilder).toContain(table);
    expect(ownerBuilder).toContain("student.dojo_id === DEFAULT_DOJO_ID");
    expect(ownerBuilder).toContain("p.created_at AS created_at");
    expect(ownerBuilder).toContain("ap.created_at AS created_at");
    expect(ownerBuilder).toContain("ORDER BY created_at DESC LIMIT 30");
    expect(ownerBuilder).not.toContain("admin_notes");
    expect(ownerBuilder).not.toContain("internal_note");
    expect(ownerBuilder).not.toContain("answers_json");
  });

  it("requires a one-use short-lived lookup session for student hours without a second credential", () => {
    const hours = file("functions/api/records/hours.ts");
    expect(hours).toContain("validStudentAccessSession");
    expect(hours).toContain("student_access_sessions SET used_at");
    expect(hours).not.toContain("verifyStudentPin");
    expect(hours).toContain('status: "pending"');
  });

  it("records a contribution attempt as awaiting payment and never as paid", () => {
    const contribution = file("functions/api/contributions.ts");
    expect(contribution).toContain("namesLikelyMatch");
    expect(contribution).toContain("'awaiting_payment'");
    expect(contribution).toContain("contribution_period_students");
    expect(contribution).not.toContain("status, 'paid'");
  });

  it("groups up to ten RenShinKan students under one monthly payment and payslip", () => {
    const contribution = file("functions/api/contributions.ts");
    const review = file("functions/api/admin/payment-proofs.ts");
    for (const value of [
      "configuredMonthlyContributionAmount",
      "MAX_CONTRIBUTION_STUDENTS = 10",
      "paymentRequestId",
      "coveredStudents",
      "totalAmount",
      "payment_group_id",
      "expected_amount",
    ])
      expect(contribution).toContain(value);
    expect(contribution).not.toMatch(/MONTHLY_CONTRIBUTION_AMOUNT\s*=\s*\d+/);
    expect(contribution).toContain("Each student can appear only once");
    expect(review).toContain(
      "WHERE payment_group_id = ? OR (id = ? AND student_id = ?)",
    );
    expect(review).toContain("Number(target.expected_amount)");
    expect(review).not.toContain("target.expected_amount || 1800");
    expect(review).toContain("covered_student_count");
  });
});

describe("UI and responsive workflow contracts", () => {
  it("removes decision explanations and private review-note interfaces", () => {
    const students = file("src/pages/AdminStudentsPage.tsx");
    const contributions = file(
      "src/components/admin/AdminMonthlyContributions.tsx",
    );
    const proofs = file("src/components/admin/AdminPaymentProofs.tsx");
    expect(students).not.toContain("Review explanation");
    expect(students).not.toContain("Internal review note");
    expect(contributions).not.toContain("Internal note");
    expect(proofs).not.toContain("Student-visible explanation");
    expect(proofs).not.toContain("Internal administrator note");
  });

  it("removes the decorative background only from administrator routes", () => {
    const app = file("src/App.tsx");
    const css = file("src/index.css");
    expect(app).toContain('location.pathname.startsWith("/admin")');
    expect(css).toContain("html.admin-route body");
    expect(css).toContain("background: #ffffff !important");
    expect(css).toContain("html.admin-route main");
  });

  it("separates students, examination cycles, and monthly contributions into focused workspaces", () => {
    const admin = file("src/pages/AdminStudentsPage.tsx");
    const exams = file("src/components/admin/AdminExamApplications.tsx");
    const contributions = file(
      "src/components/admin/AdminMonthlyContributions.tsx",
    );
    for (const value of [
      "Students",
      "Exam applications",
      "Monthly contributions",
      "current_rank",
      "Add training hours",
      "Mass promotion",
      "Record mass exam pass",
      "Accept pending profiles",
      "Archive active students",
      "Unarchive students",
      "Delete archived students",
    ])
      expect(admin).toContain(value);
    for (const value of [
      "Start New Exam Cycle",
      "Not signed up",
      "Read-only historical cycle",
      "Confirm status change",
    ])
      expect(exams).toContain(value);
    for (const value of [
      "Awaiting payment",
      "Paid rate",
      "Recent periods",
      "Accessible monthly contribution totals",
      "contribution-chart",
    ])
      expect(contributions).toContain(value);
    expect(admin).toContain("onWheel");
    expect(admin).toContain("Review changes");
    expect(admin).toContain("admin-select-box");
    expect(admin).toContain("DELETE ${count} ARCHIVED STUDENT");
  });

  it("keeps complete examination applications viewable as scoped historical records", () => {
    const exams = file("src/components/admin/AdminExamApplications.tsx");
    const detail = file("functions/api/admin/examinations/[applicationId].ts");
    for (const value of [
      "Open record",
      "Available in Application records",
      "Student answers",
      "Application timeline",
      "Permanent examination record",
      "Private administrator record",
    ])
      expect(exams).toContain(value);
    expect(exams).not.toContain("View application");
    expect(exams).toContain("applicationDetail.application.answers");
    expect(exams).toContain("applicationDetail.history");
    expect(detail).toContain("answers_json");
    expect(detail).toContain("application_status_history");
    expect(detail).toContain("canAccessDojo(session, application.dojo_id)");
    expect(detail).toContain('"Cache-Control": "private, no-store"');
  });

  it("shows one status-aware action menu and scopes every bulk operation to eligible students", () => {
    const admin = file("src/pages/AdminStudentsPage.tsx");
    const bulk = file("functions/api/admin/students/bulk.ts");
    const student = file("functions/api/admin/students/[id].ts");
    const css = file("src/index.css");
    for (const value of [
      "selectedActiveRows",
      "selectedPendingProfiles",
      "selectedArchivedRows",
      "Only eligible selected records were changed",
      "Set record status",
      "Training & rank actions",
      "Record mass exam pass",
      "Unarchive",
      "Deny pending profiles",
      "Delete archived",
    ])
      expect(admin).toContain(value);
    expect(compact(admin)).toContain(
      'const targets = bulk.type === "approve_hours" ? selectedPendingRows : selectedActiveRows',
    );
    expect(admin).toContain("function studentRecordStatus");
    expect(admin).toContain("student.active !== 1");
    expect(admin).toContain("<Status value={studentRecordStatus(student)} />");
    expect(admin).not.toContain("<Status value={student.profile_status} />");
    expect(admin).not.toContain(
      "Actions apply only to eligible selected rows; the confirmation lists the exact students affected.",
    );
    expect(admin).toContain("admin-delete-archived");
    expect(css).toContain(".admin-delete-archived");
    expect(bulk).toContain('body.action === "mass_rank_change"');
    expect(bulk).toContain('action: "mass_exam_pass"');
    expect(bulk).toContain(
      'student.active !== 1 || student.archived_at || student.profile_status !== "approved"',
    );
    expect(student).toContain("Only an archived student can be deleted.");
  });

  it("supports compact AAT membership selection and collapses empty payment history", () => {
    const memberships = file("src/components/admin/AdminAatMemberships.tsx");
    const membershipsApi = file("functions/api/admin/memberships.ts");
    const css = file("src/index.css");
    for (const value of [
      "selectedIds",
      "Select all visible AAT memberships",
      "Select AAT membership for",
      "openPayment(selectedRows)",
      "Each student keeps their existing AAT membership number",
      "No payments",
    ])
      expect(memberships).toContain(value);
    for (const value of [
      "profile_image_url",
      "admin-student-identity",
      "admin-row-actions",
      "<th>Actions</th>",
    ])
      expect(memberships).toContain(value);
    expect(membershipsApi).toContain("s.profile_image_url");
    expect(memberships).toMatch(
      /row\.history\.length\s*\?\s*(?:\(\s*)?<details className="admin-aat-history"/s,
    );
    expect(css).toContain(".admin-aat-history-empty");
    expect(css).toContain(".admin-aat-bulk-bar");
    expect(css).toContain(".admin-aat-membership-cell");
    expect(memberships).toContain("Awaiting payment review");
    expect(memberships).toContain("Payment required");
  });

  it("uses student identities and compact row actions throughout admin tables", () => {
    const proofs = file("src/components/admin/AdminPaymentProofs.tsx");
    const contributions = file(
      "src/components/admin/AdminMonthlyContributions.tsx",
    );
    const exams = file("src/components/admin/AdminExamApplications.tsx");
    const proofApi = file("functions/api/admin/payment-proofs.ts");
    const contributionApi = file("functions/api/admin/contributions.ts");
    const css = file("src/index.css");
    for (const source of [proofs, contributions]) {
      expect(source).toContain("profile_image_url");
      expect(source).toContain("admin-student-identity");
    }
    expect(proofs).toContain("admin-row-actions");
    expect(proofs).toContain("<th>Actions</th>");
    expect(contributions).toContain("admin-row-action-select");
    expect(exams).toContain("admin-row-action-select");
    expect(proofApi).toContain("s.profile_image_url");
    expect(contributionApi).toContain("s.profile_image_url");
    expect(css).toContain(".admin-record-table select.admin-row-action-select");
  });

  it("records optional training locations and administrator-selected examination dates", () => {
    const admin = file("src/pages/AdminStudentsPage.tsx");
    const hours = file("functions/api/admin/students/[id]/hours.ts");
    const exam = file("functions/api/admin/students/[id]/exam.ts");
    const bulk = file("functions/api/admin/students/bulk.ts");
    const detail = file("functions/api/admin/students/[id].ts");
    const migration = file("migrations/0009_training_hour_locations.sql");
    for (const value of [
      "Training location",
      "hoursLocation",
      "training_location",
      "Examination date",
      "examinationDate",
      "formatDay(entry.entry_date",
      "entry.examination_date || entry.examination_timestamp",
    ])
      expect(admin).toContain(value);
    expect(hours).toContain(
      "Training location must be 200 characters or fewer.",
    );
    expect(hours).toContain("training_location");
    expect(detail).toContain("training_location");
    expect(migration).toContain("ADD COLUMN training_location TEXT");
    expect(exam).toContain("Choose a valid examination date.");
    expect(exam).toContain(".bind(examId, studentId, examinationDate");
    expect(bulk).toContain("training_location");
  });

  it("shows compact workspace tabs, pending payment, existing bank QR, owner QR tools, and mobile layouts", () => {
    const page = file("src/pages/StudentRecordsPage.tsx");
    const css = file("src/index.css");
    for (const text of [
      "Find my record",
      "My passport",
      "New profile",
      "Exam application",
      "content.paymentQr",
      "Copy link",
      "Download QR",
      "Submit for review",
    ])
      expect(page).toContain(text);
    expect(page).toContain("Current dojo");
    expect(page).not.toMatch(/guarantor/i);
    expect(page).toContain("LOOKUP_VERIFICATION_PENDING");
    expect(page).toContain("disabled={busy || !token}");
    for (const successCopy of [
      "Your student profile is ready",
      "Name used for access",
      "Pending administrator review",
      "Save or photograph these details.",
      "Apply for kyu examinations.",
      "Submit RenShinKan monthly contributions, when applicable.",
      "View and update your student portfolio.",
      "Share your portfolio with another dojo or gym.",
      "Open my student profile",
    ])
      expect(page).toContain(successCopy);
    const compactCss = css.replace(/\s+/g, " ");
    expect(compactCss).toContain(".record-workspace-tabs { display: flex");
    expect(compactCss).toContain("overflow-x: auto");
  });

  it("renders an accessible responsive digital student passport from real record fields", () => {
    const passport = file("src/components/studentPassport/DigitalPassport.tsx");
    const styles = file(
      "src/components/studentPassport/DigitalPassport.module.css",
    );
    const page = file("src/pages/StudentRecordsPage.tsx");
    for (const label of [
      "Student Identity",
      "Training Record",
      "Examination History",
      "Contributions",
      "Requests",
      "Identity Record",
      "Verified Training",
      "AAT Annual Contribution",
      "RenShinKan Monthly Contribution",
      "Request History",
    ])
      expect(passport).toContain(label);
    for (const accessibility of [
      'role="tablist"',
      'role="tab"',
      'role="tabpanel"',
      "aria-selected",
      "aria-controls",
      '"Approved and verified by the dojo"',
      '"Pending administrator review"',
    ])
      expect(passport).toContain(accessibility);
    expect(passport).toContain("record.monthlyContributions !== null");
    expect(compact(passport)).toContain(
      'showMonthlyContributions ? ( <PassportPage folio="08"',
    );
    expect(passport).toContain("HistoryPagination");
    expect(passport).toContain("studentAlerts.position");
    expect(passport).toContain("owner?.dojoLogo");
    expect(page).toContain("StudentPassportRecord");
    expect(styles).toContain("--passport-burgundy");
    expect(styles).toContain(
      "grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)",
    );
    expect(styles).toContain("@media (max-width: 900px)");
    expect(styles).toContain("@media (max-width: 620px)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("lets administrators prepare and upload an optional student profile photo", () => {
    const admin = file("src/pages/AdminStudentsPage.tsx");
    const upload = file("functions/api/admin/students/upload.ts");
    for (const value of [
      "prepareProfilePhoto",
      "/api/admin/students/upload",
      "profileImageUrl",
      "profileImageConsent",
      "Add profile photo (optional)",
    ])
      expect(admin).toContain(value);
    expect(upload).toContain("onRequestDelete");
    expect(upload).toContain("await env.MEDIA_BUCKET.delete(key)");
  });

  it("uses an optional present address and country-aware telephone control", () => {
    const page = file("src/pages/StudentRecordsPage.tsx");
    for (const value of [
      "Leave blank if it is the same as your permanent address",
      "Country calling code",
      "PHONE_COUNTRIES",
      "tel-national",
    ])
      expect(page).toContain(value);
    expect(page).not.toMatch(/Current address<[^>]*>.*required/);
  });

  it("keeps personal exam answers out of persistent browser storage and removes the retired extra credential", () => {
    const studentPage = file("src/pages/StudentRecordsPage.tsx");
    const allLiveSource = [
      "src/pages/StudentRecordsPage.tsx",
      "src/pages/AdminStudentsPage.tsx",
      "functions/api/records/lookup.ts",
      "functions/api/records/hours.ts",
      "functions/api/records/profile-requests.ts",
      "functions/api/records/examination-applications.ts",
      "functions/api/admin/students/index.ts",
      "functions/api/admin/students/[id].ts",
    ]
      .map(file)
      .join("\n");
    expect(studentPage).not.toContain("localStorage");
    expect(allLiveSource).not.toMatch(/student[_ -]?pin/i);
  });

  it("uses the centrally editable PromptPay QR, records an attempt first, and displays a real dojo class photo", () => {
    const form = file("src/components/ContributionForm.tsx");
    const support = file("src/pages/SupportPage.tsx");
    for (const value of [
      "/api/contributions",
      "useEditableContent",
      "content.paymentQr",
      "contribution.awaitingPayment",
      "contribution.qrSafety",
      "contribution.stepUpload",
    ])
      expect(form).toContain(value);
    expect(support).toContain("content.paymentQr");
    expect(support).toContain(
      "/renshinkan-gallery/class-photos/class_group_dojo_wide_01.jpg",
    );
    expect(support).toContain("support-dojo-photo");
    expect(support).not.toContain("support-dojo-art");
    expect(support).not.toContain("/dojo-photos/support.avif");
  });

  it("requires private payslip submission after each PromptPay flow", () => {
    const upload = file("src/components/PaymentProofUpload.tsx");
    const contributions = file("src/components/ContributionForm.tsx");
    const records = file("src/pages/StudentRecordsPage.tsx");
    const examApi = file("functions/api/records/examination-applications.ts");
    const contributionApi = file("functions/api/contributions.ts");
    for (const value of [
      "paymentProof.cannotConfirm",
      "paymentProof.contactSensei",
      "paymentProof.privateRecord",
      "application/pdf",
      "/api/payment-proofs",
    ])
      expect(upload).toContain(value);
    expect(upload).not.toContain("deleted after 60 days");
    expect(contributions).toContain("PaymentProofUpload");
    expect(records).toContain("PaymentProofUpload");
    expect(records).toContain("exam-payment-grid");
    expect(records).toContain("exam-payment-qr");
    for (const source of [examApi, contributionApi]) {
      expect(source).toContain("createPaymentProofDraft");
      expect(source).toContain("proofId");
      expect(source).toContain("uploadToken");
    }
  });

  it("infers contribution dojos from student records and keeps payment-history reminders", () => {
    const form = file("src/components/ContributionForm.tsx");
    const api = file("functions/api/contributions.ts");
    const css = file("src/index.css");
    expect(form).toContain('fetch("/api/contributions"');
    expect(form).toContain("monthlyContributionAmount");
    expect(form).not.toContain("contribution.chooseDojo");
    expect(form).not.toContain('fetch("/api/dojos"');
    expect(form).toContain("PaymentReminder");
    expect(form).toContain("contribution.monthlyReminder");
    expect(form).toContain("contribution.aatNoHistoryMessage");
    expect(api).not.toContain("submitted.dojoId");
    expect(api).toContain("configuredAatAnnualContributionAmount");
    expect(api).toContain("student_id_aliases");
    expect(api).toContain('student.dojo_id !== DEFAULT_DOJO_ID');
    expect(api).toContain("aat_last_paid_date");
    expect(api).toContain("lastPayment");
    expect(api).toContain("previousMonthKey");
    for (const selector of [
      ".contribution-kind",
      ".contribution-reminder",
      ".contribution-qr-frame",
      ".contribution-next-steps",
    ])
      expect(css).toContain(selector);
  });

  it("calculates one clear monthly total for multiple student records", () => {
    const form = file("src/components/ContributionForm.tsx");
    const css = file("src/index.css");
    for (const value of [
      "monthlyContributionAmount",
      "contribution.addStudent",
      "contribution.who",
      "monthlyStudents.length",
      "contribution.totalToPay",
      "contribution.serverVerifies",
    ])
      expect(form).toContain(value);
    expect(form).not.toMatch(/MONTHLY_CONTRIBUTION_AMOUNT\s*=\s*\d+/);
    for (const selector of [
      ".contribution-student-list",
      ".contribution-student-row",
      ".contribution-payment-total",
    ])
      expect(css).toContain(selector);
  });

  it("provides retained, scoped individual and bulk payslip review", () => {
    const migration = file("migrations/0010_payment_proofs.sql");
    const uploadApi = file("functions/api/payment-proofs.ts");
    const adminApi = file("functions/api/admin/payment-proofs.ts");
    const imageApi = file("functions/api/admin/payment-proofs/[id].ts");
    const adminPage = file("src/pages/AdminStudentsPage.tsx");
    const adminProofs = file("src/components/admin/AdminPaymentProofs.tsx");
    const packageJson = file("package.json");
    const studentImageApi = file(
      "functions/api/records/payment-proofs/[id].ts",
    );
    expect(migration).toContain("TABLE IF NOT EXISTS payment_proofs");
    expect(migration).toContain("'exam', 'aat_annual', 'renshinkan_monthly'");
    expect(uploadApi).toContain("upload_token_expires_at");
    expect(uploadApi).toContain("expires_at = NULL");
    expect(uploadApi).toContain("payment-proofs/");
    expect(adminApi).toContain("isRenShinKanSuperAdmin");
    expect(adminApi).toContain("s.dojo_id = ?");
    expect(adminApi).toContain("pending_review");
    expect(adminApi).toContain('action === "approve"');
    expect(adminApi).toContain('action === "deny"');
    expect(imageApi).toContain('"Cache-Control": "private, no-store"');
    expect(studentImageApi).toContain("validStudentAccessSession");
    expect(studentImageApi).toContain('"Cache-Control": "private, no-store"');
    expect(adminPage).toContain("Payment proofs");
    for (const value of [
      "Select every pending payment proof",
      "Confirm payment",
      "Reject proof",
      "Payment proof submitted by",
      "Payment for",
    ])
      expect(adminProofs).toContain(value);
    expect(adminProofs).toContain("Private retained file");
    expect(adminProofs).toContain('opened.content_type === "application/pdf"');
    expect(packageJson).not.toContain("payment-proofs-60-days");
  });
});
