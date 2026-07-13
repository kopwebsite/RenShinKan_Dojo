import { hasValidAdminSession, isSameOriginRequest, jsonResponse } from "../../../_lib/auth";
import { auditStatement, requestIdentifier, requireStudentDb, type D1PreparedStatement, type StudentEnv } from "../../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };
type Application = { id: string; student_id: string; status: string; payment_status: string };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await hasValidAdminSession(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const cycle = await db.prepare("SELECT id, name FROM examination_cycles WHERE status = 'active' ORDER BY created_at DESC LIMIT 1")
    .first<{ id: string; name: string }>();
  if (!cycle) return jsonResponse({ cycle: null, affectedStudents: 0, applications: 0 });
  const counts = await db.prepare(`SELECT COUNT(*) AS applications, COUNT(DISTINCT student_id) AS affected_students
    FROM examination_applications WHERE cycle_id = ? AND status <> 'archived'`).bind(cycle.id)
    .first<{ applications: number; affected_students: number }>();
  return jsonResponse({ cycle, applications: Number(counts?.applications || 0), affectedStudents: Number(counts?.affected_students || 0) }, 200, { "Cache-Control": "no-store" });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request) || !(await hasValidAdminSession(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const requestId = requestIdentifier(request);
  try {
    const body = await request.json<{ phrase?: unknown; confirmed?: unknown }>();
    if (body.confirmed !== true || body.phrase !== "RESET EXAM STATUS") return jsonResponse({ error: "Enter RESET EXAM STATUS exactly to confirm the reset." }, 400);
    const db = requireStudentDb(env);
    const cycle = await db.prepare("SELECT id, name FROM examination_cycles WHERE status = 'active' ORDER BY created_at DESC LIMIT 1")
      .first<{ id: string; name: string }>();
    if (!cycle) return jsonResponse({ error: "No active examination cycle was found." }, 409);
    const applications = (await db.prepare(`SELECT id, student_id, status, payment_status FROM examination_applications
      WHERE cycle_id = ? AND status <> 'archived'`).bind(cycle.id).all<Application>()).results || [];
    const now = new Date().toISOString();
    const bulkOperationId = crypto.randomUUID();
    const nextCycleId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      db.prepare("UPDATE examination_cycles SET status = 'closed', closed_at = ?, closed_by = 'primary_admin' WHERE id = ? AND status = 'active'")
        .bind(now, cycle.id),
      db.prepare("INSERT INTO examination_cycles (id, name, status, created_at) VALUES (?, 'Upcoming belt examination', 'active', ?)")
        .bind(nextCycleId, now),
    ];
    for (const application of applications) {
      statements.push(
        db.prepare("UPDATE examination_applications SET status = 'archived', updated_at = ? WHERE id = ?").bind(now, application.id),
        db.prepare(`INSERT INTO application_status_history
          (id, application_id, previous_status, new_status, previous_payment_status, new_payment_status,
           actor_identifier, note, bulk_operation_id, request_id, created_at)
          VALUES (?, ?, ?, 'archived', ?, ?, 'primary_admin', 'Examination cycle reset; history preserved', ?, ?, ?)`)
          .bind(crypto.randomUUID(), application.id, application.status, application.payment_status, application.payment_status, bulkOperationId, requestId, now),
      );
    }
    statements.push(auditStatement(db, {
      actorType: "administrator", actorIdentifier: "primary_admin", action: "examination_statuses_reset", entityType: "examination_cycle", entityId: cycle.id,
      previousValues: { cycleId: cycle.id, cycleName: cycle.name, applications: applications.map((application) => ({ id: application.id, studentId: application.student_id, status: application.status, paymentStatus: application.payment_status })) },
      newValues: { affectedStudents: new Set(applications.map((application) => application.student_id)).size, archivedApplications: applications.length, nextCycleId },
      source: "admin_examination_reset", bulkOperationId, requestId,
      summary: `Closed ${cycle.name} and archived ${applications.length} application status${applications.length === 1 ? "" : "es"}; history preserved`, createdAt: now,
    }));
    await db.batch(statements);
    return jsonResponse({ ok: true, affectedStudents: new Set(applications.map((application) => application.student_id)).size, archivedApplications: applications.length, bulkOperationId, nextCycleId });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The examination statuses could not be reset." }, 400);
  }
};
