import { jsonResponse } from "../../_lib/auth";
import {
  auditStatement,
  normalizeStudentId,
  requestIdentifier,
  requireStudentDb,
  studentTotal,
  type StudentEnv,
  validStudentAccessSession,
  verifyStudentPin,
} from "../../_lib/studentRecords";

type Payload = { studentId?: unknown; accessToken?: unknown; pin?: unknown; hours?: unknown };

export const onRequestPost: PagesFunction<StudentEnv> = async ({ request, env }) => {
  const requestId = requestIdentifier(request);
  try {
    const db = requireStudentDb(env);
    const replay = await db.prepare("SELECT response_json FROM mutation_requests WHERE request_id = ? LIMIT 1").bind(requestId)
      .first<{ response_json: string | null }>();
    if (replay?.response_json) return jsonResponse(JSON.parse(replay.response_json), 200, { "Cache-Control": "no-store" });
    const body = await request.json<Payload>();
    const publicStudentId = normalizeStudentId(typeof body.studentId === "string" ? body.studentId : "");
    const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";
    const hours = Number(body.hours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 1000) return jsonResponse({ error: "Enter a positive number of hours, up to 1,000." }, 400);
    const student = await db.prepare(`SELECT id, student_pin_hash FROM students
      WHERE UPPER(public_student_id) = ? AND active = 1 AND public_visible = 1 AND profile_status = 'approved' LIMIT 1`)
      .bind(publicStudentId).first<{ id: string; student_pin_hash: string | null }>();
    if (!student || !(await verifyStudentPin(pin, student.student_pin_hash))) return jsonResponse({ error: "The Student ID or secure PIN is incorrect." }, 403);
    const session = await validStudentAccessSession(db, student.id, accessToken);
    if (!session) return jsonResponse({ error: "Your secure record session expired. Look up the record again before submitting hours." }, 403);
    const previousTotal = await studentTotal(db, student.id);
    if (previousTotal === null) return jsonResponse({ error: "Student record not found." }, 404);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const response = { ok: true, id, status: "pending", previousTotal, requestedTotal: previousTotal + hours };
    await db.batch([
      db.prepare(`INSERT INTO training_hour_requests
        (id, student_id, submitted_hours, previous_total, requested_total, status, submitted_at, request_id)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`)
        .bind(id, student.id, hours, previousTotal, previousTotal + hours, now, requestId),
      db.prepare("UPDATE student_access_sessions SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now, session.id),
      auditStatement(db, {
        actorType: "student", actorIdentifier: student.id, action: "training_hours_submitted", entityType: "training_hour_request", entityId: id,
        studentId: student.id, previousValues: { totalHours: previousTotal },
        newValues: { hoursEntered: hours, requestedTotal: previousTotal + hours, reviewStatus: "pending" },
        source: "student_self_service", requestId, summary: `Submitted ${hours} training hours for administrator review`, createdAt: now,
      }),
      db.prepare("INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'student', 'training_hours_submitted', ?, ?)")
        .bind(requestId, JSON.stringify(response), now),
    ]);
    return jsonResponse(response, 201, { "Cache-Control": "no-store" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Training hours could not be submitted.";
    return jsonResponse({ error: message.includes("UNIQUE") ? "These hours were already submitted." : message }, message.includes("UNIQUE") ? 409 : 400);
  }
};
