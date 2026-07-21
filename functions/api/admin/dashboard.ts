import { getAdminSession, jsonResponse } from "../../_lib/auth";
import { requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await getAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const dojoId = session.role === "dojo" ? session.allowedDojoIds[0] || "__none__" : "";
  const scope = dojoId ? " AND s.dojo_id = ?" : "";
  const bind = dojoId ? [dojoId] : [];
  const [countsResult, profiles, applications, payments, hours, failures] = await db.batch([
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM students s WHERE s.profile_status = 'pending_admin_approval' ${scope}) AS pending_profiles,
      (SELECT COUNT(*) FROM exam_cycle_student_status ecs JOIN examination_cycles ec ON ec.id = ecs.cycle_id JOIN students s ON s.id = ecs.student_id
        WHERE ec.status = 'active' AND ecs.application_id IS NOT NULL ${scope}) AS new_applications,
      (SELECT COUNT(*) FROM exam_cycle_student_status ecs JOIN examination_cycles ec ON ec.id = ecs.cycle_id JOIN students s ON s.id = ecs.student_id
        WHERE ec.status = 'active' AND ecs.status = 'unpaid' ${scope}) AS payment_pending,
      (SELECT COUNT(*) FROM training_hour_requests r JOIN students s ON s.id = r.student_id WHERE r.status = 'pending' ${scope}) AS pending_hours,
      ${session.role === "central" ? "(SELECT COUNT(*) FROM operation_failures WHERE resolved_at IS NULL)" : "0"} AS failed_operations`).bind(...bind, ...bind, ...bind, ...bind),
    db.prepare(`SELECT s.id, s.public_student_id, s.display_name, s.updated_at AS created_at
      FROM students s WHERE s.profile_status = 'pending_admin_approval' ${scope} ORDER BY s.updated_at DESC LIMIT 10`).bind(...bind),
    db.prepare(`SELECT ecs.id, ecs.student_id, ecs.student_public_id_snapshot AS public_student_id,
        ecs.student_name_snapshot AS display_name, ecs.application_date AS created_at,
        ecs.requested_rank_snapshot AS attempted_rank
      FROM exam_cycle_student_status ecs JOIN examination_cycles ec ON ec.id = ecs.cycle_id JOIN students s ON s.id = ecs.student_id
      WHERE ec.status = 'active' AND ecs.application_id IS NOT NULL ${scope}
      ORDER BY ecs.application_date DESC LIMIT 10`).bind(...bind),
    db.prepare(`SELECT ecs.id, ecs.student_id, ecs.student_public_id_snapshot AS public_student_id,
        ecs.student_name_snapshot AS display_name, ecs.application_date AS created_at
      FROM exam_cycle_student_status ecs JOIN examination_cycles ec ON ec.id = ecs.cycle_id JOIN students s ON s.id = ecs.student_id
      WHERE ec.status = 'active' AND ecs.status = 'unpaid' ${scope}
      ORDER BY ecs.application_date DESC LIMIT 10`).bind(...bind),
    db.prepare(`SELECT r.id, r.student_id, s.public_student_id, s.display_name, r.submitted_at AS created_at, r.submitted_hours
      FROM training_hour_requests r JOIN students s ON s.id = r.student_id
      WHERE r.status = 'pending' ${scope} ORDER BY r.submitted_at DESC LIMIT 10`).bind(...bind),
    db.prepare(`SELECT id, action, student_id, error_summary, created_at FROM operation_failures
      WHERE resolved_at IS NULL ${session.role === "central" ? "" : "AND 1 = 0"} ORDER BY created_at DESC LIMIT 10`),
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
