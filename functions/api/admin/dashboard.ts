import { hasValidAdminSession, jsonResponse } from "../../_lib/auth";
import { requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await hasValidAdminSession(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const [countsResult, profiles, applications, payments, hours, failures] = await db.batch([
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM students WHERE profile_status = 'pending_admin_approval') AS pending_profiles,
      (SELECT COUNT(*) FROM exam_cycle_student_status ecs JOIN examination_cycles ec ON ec.id = ecs.cycle_id
        WHERE ec.status = 'active' AND ecs.application_id IS NOT NULL) AS new_applications,
      (SELECT COUNT(*) FROM exam_cycle_student_status ecs JOIN examination_cycles ec ON ec.id = ecs.cycle_id
        WHERE ec.status = 'active' AND ecs.status = 'unpaid') AS payment_pending,
      (SELECT COUNT(*) FROM training_hour_requests WHERE status = 'pending') AS pending_hours,
      (SELECT COUNT(*) FROM operation_failures WHERE resolved_at IS NULL) AS failed_operations`),
    db.prepare(`SELECT s.id, s.public_student_id, s.display_name, s.updated_at AS created_at
      FROM students s WHERE s.profile_status = 'pending_admin_approval' ORDER BY s.updated_at DESC LIMIT 10`),
    db.prepare(`SELECT ecs.id, ecs.student_id, ecs.student_public_id_snapshot AS public_student_id,
        ecs.student_name_snapshot AS display_name, ecs.application_date AS created_at,
        ecs.requested_rank_snapshot AS attempted_rank
      FROM exam_cycle_student_status ecs JOIN examination_cycles ec ON ec.id = ecs.cycle_id
      WHERE ec.status = 'active' AND ecs.application_id IS NOT NULL
      ORDER BY ecs.application_date DESC LIMIT 10`),
    db.prepare(`SELECT ecs.id, ecs.student_id, ecs.student_public_id_snapshot AS public_student_id,
        ecs.student_name_snapshot AS display_name, ecs.application_date AS created_at
      FROM exam_cycle_student_status ecs JOIN examination_cycles ec ON ec.id = ecs.cycle_id
      WHERE ec.status = 'active' AND ecs.status = 'unpaid'
      ORDER BY ecs.application_date DESC LIMIT 10`),
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
