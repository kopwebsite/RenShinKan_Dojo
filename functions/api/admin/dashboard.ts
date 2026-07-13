import { hasValidAdminSession, jsonResponse } from "../../_lib/auth";
import { requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await hasValidAdminSession(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const [countsResult, profiles, applications, payments, hours, failures] = await db.batch([
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM students WHERE profile_status = 'pending_admin_approval') AS pending_profiles,
      (SELECT COUNT(*) FROM examination_applications WHERE status = 'application_submitted') AS new_applications,
      (SELECT COUNT(*) FROM examination_applications WHERE status = 'application_submitted' AND payment_status = 'payment_pending') AS payment_pending,
      (SELECT COUNT(*) FROM training_hour_requests WHERE status = 'pending') AS pending_hours,
      (SELECT COUNT(*) FROM operation_failures WHERE resolved_at IS NULL) AS failed_operations`),
    db.prepare(`SELECT s.id, s.public_student_id, s.display_name, s.updated_at AS created_at
      FROM students s WHERE s.profile_status = 'pending_admin_approval' ORDER BY s.updated_at DESC LIMIT 10`),
    db.prepare(`SELECT a.id, a.student_id, s.public_student_id, s.display_name, a.submitted_at AS created_at, a.attempted_rank
      FROM examination_applications a JOIN students s ON s.id = a.student_id
      WHERE a.status = 'application_submitted' ORDER BY a.submitted_at DESC LIMIT 10`),
    db.prepare(`SELECT a.id, a.student_id, s.public_student_id, s.display_name, a.submitted_at AS created_at
      FROM examination_applications a JOIN students s ON s.id = a.student_id
      WHERE a.status = 'application_submitted' AND a.payment_status = 'payment_pending' ORDER BY a.submitted_at DESC LIMIT 10`),
    db.prepare(`SELECT r.id, r.student_id, s.public_student_id, s.display_name, r.submitted_at AS created_at, r.submitted_hours
      FROM training_hour_requests r JOIN students s ON s.id = r.student_id
      WHERE r.status = 'pending' ORDER BY r.submitted_at DESC LIMIT 10`),
    db.prepare(`SELECT id, action, student_id, error_summary, created_at FROM operation_failures
      WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 10`),
  ]);
  const counts = (countsResult.results?.[0] || {}) as Record<string, number>;
  return jsonResponse({
    counts: {
      pendingProfiles: Number(counts.pending_profiles || 0),
      newApplications: Number(counts.new_applications || 0),
      paymentPending: Number(counts.payment_pending || 0),
      pendingHours: Number(counts.pending_hours || 0),
      failedOperations: Number(counts.failed_operations || 0),
    },
    alerts: {
      pendingProfiles: profiles.results || [],
      newApplications: applications.results || [],
      paymentPending: payments.results || [],
      pendingHours: hours.results || [],
      failedOperations: failures.results || [],
    },
  }, 200, { "Cache-Control": "no-store" });
};
