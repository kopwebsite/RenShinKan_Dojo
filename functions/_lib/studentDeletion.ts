import { canAccessDojo, effectivePermissionLevel, type AdminSession } from "./auth";
import {
  contributionPeriodCountStatement,
  type D1Database,
  type D1PreparedStatement,
} from "./studentRecords";

/**
 * Permanent student deletion ("delete forever").
 *
 * Archiving keeps everything and stays the normal way to record that a student
 * left the dojo. This module exists only for the other case: a record that was
 * created by mistake and must leave no trace.
 *
 * Everything here is shared by the preview endpoint and the delete endpoint so
 * the administrator is shown exactly what the transaction will remove.
 */

export type StudentDeletionTarget = {
  id: string;
  public_student_id: string;
  display_name: string;
  english_name: string | null;
  thai_name: string | null;
  current_belt: string;
  dojo_id: string;
  dojo_name: string;
  active: number;
  archived_at: string | null;
  profile_image_url: string | null;
  pending_profile_image_key: string | null;
};

/**
 * Groups are listed in the order they are shown to the administrator, and are
 * the single source of truth for "everything that will be erased".
 */
const DELETION_GROUPS = [
  { key: "monthlyContributions", label: "Monthly contribution records", from: "monthly_contributions WHERE student_id = ?" },
  {
    key: "contributionHistory",
    label: "Monthly contribution history entries",
    from: "contribution_status_history WHERE contribution_id IN (SELECT id FROM monthly_contributions WHERE student_id = ?)",
  },
  { key: "monthRoster", label: "Month roster entries", from: "contribution_period_students WHERE student_id = ?" },
  { key: "payments", label: "Payment records", from: "payments WHERE student_id = ?" },
  {
    key: "paymentHistory",
    label: "Payment history entries",
    from: "payment_history WHERE payment_id IN (SELECT id FROM payments WHERE student_id = ?)",
  },
  { key: "paymentRequests", label: "Payment request lines", from: "payment_request_items WHERE student_id = ?" },
  { key: "paymentProofs", label: "Payment proof records", from: "payment_proofs WHERE student_id = ?" },
  { key: "aatPayments", label: "Annual AAT contribution records", from: "aat_membership_payments WHERE student_id = ?" },
  { key: "examApplications", label: "Examination applications", from: "examination_applications WHERE student_id = ?" },
  {
    key: "examApplicationHistory",
    label: "Examination application history entries",
    from: "application_status_history WHERE application_id IN (SELECT id FROM examination_applications WHERE student_id = ?)",
  },
  { key: "examCycleRoster", label: "Examination cycle roster entries", from: "exam_cycle_student_status WHERE student_id = ?" },
  {
    key: "examCycleHistory",
    label: "Examination cycle history entries",
    from: "exam_cycle_status_history WHERE cycle_status_id IN (SELECT id FROM exam_cycle_student_status WHERE student_id = ?)",
  },
  { key: "examinations", label: "Examination results", from: "belt_examinations WHERE student_id = ?" },
  { key: "trainingHours", label: "Training hour entries", from: "training_hours WHERE student_id = ?" },
  { key: "trainingHourRequests", label: "Training hour requests", from: "training_hour_requests WHERE student_id = ?" },
  {
    key: "requestDecisions",
    label: "Recorded request decisions",
    from: `request_decisions WHERE
      (request_type = 'profile_information' AND request_id = ?)
      OR (request_type = 'training_hours' AND request_id IN (SELECT id FROM training_hour_requests WHERE student_id = ?))
      OR (request_type = 'examination_application' AND request_id IN (SELECT id FROM examination_applications WHERE student_id = ?))
      OR (request_type IN ('payment_proof', 'payslip') AND request_id IN (SELECT id FROM payment_proofs WHERE student_id = ?))`,
    bindings: 4,
  },
  { key: "shareLinks", label: "Share links", from: "share_tokens WHERE student_id = ?" },
  { key: "signInSessions", label: "Student sign-in sessions", from: "student_access_sessions WHERE student_id = ?" },
  { key: "previousStudentIds", label: "Previous Student ID records", from: "student_id_aliases WHERE student_id = ?" },
  { key: "dojoTransfers", label: "Dojo transfer history", from: "student_dojo_history WHERE student_id = ?" },
  { key: "profileMedia", label: "Stored profile photo records", from: "student_profile_media WHERE student_id = ?" },
  { key: "failedOperations", label: "Failed operation notes", from: "operation_failures WHERE student_id = ?" },
  {
    key: "assistantOperations",
    label: "Admin assistant operation payloads",
    from: `admin_ai_operations WHERE payload_scrubbed_at IS NULL AND (
      normalized_args_json LIKE '%' || ? || '%' OR preview_json LIKE '%' || ? || '%'
      OR id IN (SELECT operation_id FROM admin_ai_execution_guards WHERE target_id = ?))`,
    bindings: 3,
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  from: string;
  bindings?: number;
}>;

export type DeletionGroupKey = (typeof DELETION_GROUPS)[number]["key"];

export type StudentDeletionPlan = {
  groups: Array<{ key: string; label: string; count: number }>;
  /** Rows deleted outright, excluding the student row itself. */
  relatedRecords: number;
  /** Everything removed, including the student row. */
  totalRecords: number;
  /** Audit entries stripped of the student's name and Student ID. */
  auditEntriesRedacted: number;
  objectKeys: string[];
  contributionMonths: string[];
  paymentRequestIds: string[];
};

/** Matches the stored profile image URL shape and returns its storage key. */
export function profileObjectKey(value: string | null | undefined) {
  return (
    value?.match(
      /^\/uploads\/(student-profiles\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.webp)$/i,
    )?.[1] || null
  );
}

/**
 * Permanent deletion is offered only to an administrator who may already delete
 * this student's records: they must be able to manage the student's own dojo,
 * checked here on the server rather than trusted from the browser.
 */
export function canPermanentlyDeleteStudent(
  session: AdminSession | null | undefined,
  dojoId: string | null | undefined,
) {
  return Boolean(session && canAccessDojo(session, dojoId));
}

export async function loadDeletionTarget(db: D1Database, studentId: string) {
  return db
    .prepare(
      `SELECT s.id, s.public_student_id, s.display_name, s.english_name, s.thai_name,
        s.current_belt, s.dojo_id, COALESCE(d.official_name, s.dojo_name) AS dojo_name,
        s.active, s.archived_at, s.profile_image_url, s.pending_profile_image_key
      FROM students s LEFT JOIN dojos d ON d.id = s.dojo_id WHERE s.id = ? LIMIT 1`,
    )
    .bind(studentId)
    .first<StudentDeletionTarget>();
}

/**
 * Counts every row the deletion will touch, and collects the storage keys,
 * contribution months and payment requests the transaction needs. Read-only.
 */
export async function buildStudentDeletionPlan(
  db: D1Database,
  studentId: string,
  target: StudentDeletionTarget,
): Promise<StudentDeletionPlan> {
  const selects = DELETION_GROUPS.map(
    (group) => `(SELECT COUNT(*) FROM ${group.from}) AS ${group.key}`,
  ).join(",\n    ");
  const countBindings = DELETION_GROUPS.flatMap((group) =>
    Array.from({ length: (group as { bindings?: number }).bindings ?? 1 }, () => studentId),
  );
  const counts =
    (await db
      .prepare(`SELECT\n    ${selects},\n    (SELECT COUNT(*) FROM audit_log WHERE student_id = ?) AS audit_entries`)
      .bind(...countBindings, studentId)
      .first<Record<string, number>>()) || {};

  const removableProofs =
    (
      await db
        .prepare(
          `SELECT object_key FROM payment_proofs pp
        WHERE pp.student_id = ? AND pp.object_key IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM payment_request_items pri
          WHERE pri.payment_request_id = pp.payment_reference_id AND pri.student_id <> ?
        )`,
        )
        .bind(studentId, studentId)
        .all<{ object_key: string | null }>()
    ).results || [];
  const profileMedia =
    (
      await db
        .prepare("SELECT object_key FROM student_profile_media WHERE student_id = ?")
        .bind(studentId)
        .all<{ object_key: string }>()
    ).results || [];
  const paymentRequestIds =
    (
      await db
        .prepare(
          "SELECT DISTINCT payment_request_id AS id FROM payment_request_items WHERE student_id = ?",
        )
        .bind(studentId)
        .all<{ id: string }>()
    ).results?.map((row) => row.id) || [];
  const contributionMonths =
    (
      await db
        .prepare(
          "SELECT DISTINCT month_key FROM contribution_period_students WHERE student_id = ?",
        )
        .bind(studentId)
        .all<{ month_key: string }>()
    ).results?.map((row) => row.month_key) || [];

  const groups = DELETION_GROUPS.map((group) => ({
    key: group.key as string,
    label: group.label as string,
    count: Number(counts[group.key] || 0),
  }));
  const relatedRecords = groups.reduce((total, group) => total + group.count, 0);
  const objectKeys = Array.from(
    new Set(
      [
        ...removableProofs.map((row) => row.object_key),
        ...profileMedia.map((row) => row.object_key),
        profileObjectKey(target.profile_image_url),
        target.pending_profile_image_key,
      ].filter((value): value is string => Boolean(value)),
    ),
  );

  return {
    groups,
    relatedRecords,
    totalRecords: relatedRecords + 1,
    auditEntriesRedacted: Number(counts.audit_entries || 0),
    objectKeys,
    contributionMonths,
    paymentRequestIds,
  };
}

/**
 * The ordered statements that erase the student. D1 runs a batch as one
 * transaction, so either every statement below applies or none of them do.
 *
 * Children are removed before parents because the schema uses ON DELETE
 * RESTRICT; the unlock row at the start and end is what lets the two immutable
 * financial-history tables be cleared inside this transaction only. The unlock
 * names this student, and the triggers only stand aside for this student's own
 * rows, so nobody else's financial history is ever exposed.
 */
export function studentDeletionStatements(
  db: D1Database,
  studentId: string,
  plan: StudentDeletionPlan,
  context: { deletionRecordId: string; adminName: string; now: string },
): D1PreparedStatement[] {
  const { deletionRecordId, adminName, now } = context;
  return [
    db
      .prepare(
        "INSERT INTO permanent_deletion_unlock (id, student_id, requested_by, reason, created_at) VALUES (?, ?, ?, 'permanent_student_deletion', ?)",
      )
      .bind(deletionRecordId, studentId, adminName.slice(0, 120), now),

    // Child rows first.
    db
      .prepare(
        `DELETE FROM request_decisions WHERE
        (request_type = 'profile_information' AND request_id = ?)
        OR (request_type = 'training_hours' AND request_id IN (SELECT id FROM training_hour_requests WHERE student_id = ?))
        OR (request_type = 'examination_application' AND request_id IN (SELECT id FROM examination_applications WHERE student_id = ?))
        OR (request_type IN ('payment_proof', 'payslip') AND request_id IN (SELECT id FROM payment_proofs WHERE student_id = ?))`,
      )
      .bind(studentId, studentId, studentId, studentId),
    db
      .prepare(
        "DELETE FROM application_status_history WHERE application_id IN (SELECT id FROM examination_applications WHERE student_id = ?)",
      )
      .bind(studentId),
    db
      .prepare(
        "DELETE FROM exam_cycle_status_history WHERE cycle_status_id IN (SELECT id FROM exam_cycle_student_status WHERE student_id = ?)",
      )
      .bind(studentId),
    db
      .prepare(
        "DELETE FROM contribution_status_history WHERE contribution_id IN (SELECT id FROM monthly_contributions WHERE student_id = ?)",
      )
      .bind(studentId),
    db
      .prepare(
        "DELETE FROM payment_history WHERE payment_id IN (SELECT id FROM payments WHERE student_id = ?)",
      )
      .bind(studentId),

    // A proof that also covers other students stays with one of them.
    db
      .prepare(
        `UPDATE payment_proofs SET student_id = (
        SELECT pri.student_id FROM payment_request_items pri
        WHERE pri.payment_request_id = payment_proofs.payment_reference_id AND pri.student_id <> ? LIMIT 1
      ) WHERE student_id = ? AND EXISTS (
        SELECT 1 FROM payment_request_items pri
        WHERE pri.payment_request_id = payment_proofs.payment_reference_id AND pri.student_id <> ?
      )`,
      )
      .bind(studentId, studentId, studentId),
    db.prepare("DELETE FROM payment_proofs WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM payment_request_items WHERE student_id = ?").bind(studentId),
    ...plan.paymentRequestIds.map((paymentRequestId) =>
      db
        .prepare(
          "DELETE FROM payment_requests WHERE id = ? AND NOT EXISTS (SELECT 1 FROM payment_request_items WHERE payment_request_id = ?)",
        )
        .bind(paymentRequestId, paymentRequestId),
    ),
    db.prepare("DELETE FROM student_profile_media WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM monthly_contributions WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM contribution_period_students WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM exam_cycle_student_status WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM examination_applications WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM training_hour_requests WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM training_hours WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM belt_examinations WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM share_tokens WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM student_access_sessions WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM student_id_aliases WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM student_dojo_history WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM aat_membership_payments WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM payments WHERE student_id = ?").bind(studentId),
    db.prepare("DELETE FROM operation_failures WHERE student_id = ?").bind(studentId),

    // Assistant operation payloads can quote the student; scrub them the same
    // way the scheduled payload scrub does.
    db
      .prepare(
        `UPDATE admin_ai_operations SET
        normalized_args_json = '{"scrubbed":true}', args_sha256 = 'scrubbed',
        preview_json = '{}', fingerprints_json = '{}',
        result_fingerprints_json = NULL, confirmation_sha256 = NULL,
        result_json = NULL, payload_scrubbed_at = ?, updated_at = ?
      WHERE payload_scrubbed_at IS NULL AND (
        normalized_args_json LIKE '%' || ? || '%' OR preview_json LIKE '%' || ? || '%'
        OR id IN (SELECT operation_id FROM admin_ai_execution_guards WHERE target_id = ?))`,
      )
      .bind(now, now, studentId, studentId, studentId),
    db
      .prepare("DELETE FROM admin_ai_execution_guards WHERE target_id = ?")
      .bind(studentId),

    // Audit entries survive, but nothing in them identifies the person and none
    // of them still point at a student row that no longer exists.
    db
      .prepare(
        `UPDATE audit_log SET student_id = NULL, student_public_id_snapshot = NULL,
        student_name_snapshot = NULL, previous_values = NULL, new_values = NULL,
        administrator_note = NULL,
        action_summary = 'Student details erased by permanent deletion'
      WHERE student_id = ?`,
      )
      .bind(studentId),

    db.prepare("DELETE FROM students WHERE id = ?").bind(studentId),
  ];
}

/**
 * Closing statements for the same transaction: saved roster totals are
 * recalculated so other screens stay correct, the anonymous proof of deletion
 * is written, and the immutability unlock is given back.
 */
export function studentDeletionRecordStatements(
  db: D1Database,
  session: AdminSession,
  plan: StudentDeletionPlan,
  context: {
    deletionRecordId: string;
    dojoId: string;
    requestId: string;
    now: string;
  },
): D1PreparedStatement[] {
  const { deletionRecordId, dojoId, requestId, now } = context;
  return [
    ...plan.contributionMonths.map((month) =>
      contributionPeriodCountStatement(db, month, dojoId),
    ),
    db
      .prepare(
        `INSERT INTO student_deletion_records (
        id, deleted_by, deleted_by_role, dojo_id, records_removed, files_removed,
        audit_entries_redacted, request_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        deletionRecordId,
        session.adminName.slice(0, 120),
        effectivePermissionLevel(session),
        dojoId,
        plan.totalRecords,
        plan.objectKeys.length,
        plan.auditEntriesRedacted,
        requestId,
        now,
      ),
    db
      .prepare("DELETE FROM permanent_deletion_unlock WHERE id = ?")
      .bind(deletionRecordId),
  ];
}
