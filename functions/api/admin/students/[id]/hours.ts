import { getAuthorizedAdminSession, isSameOriginRequest, jsonResponse } from "../../../../_lib/auth";
import { adminAuditMetadata, assertStudentAccess, auditStatement, requestIdentifier, requireStudentDb, studentTotal, type StudentEnv } from "../../../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const requestId = requestIdentifier(request);
  try {
    const body = await request.json<{ hours?: unknown; location?: unknown }>();
    const hours = Number(body.hours);
    const location = typeof body.location === "string" ? body.location.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
    if (!Number.isFinite(hours) || hours <= 0 || hours > 1000) return jsonResponse({ error: "Enter a positive number of hours, up to 1,000." }, 400);
    if (location.length > 200) return jsonResponse({ error: "Training location must be 200 characters or fewer." }, 400);
    const db = requireStudentDb(env);
    const studentId = String(params.id);
    const access = await assertStudentAccess(db, session, studentId);
    if (!access.ok) return jsonResponse({ error: access.error }, access.status);
    const previousTotal = await studentTotal(db, studentId);
    if (previousTotal === null) return jsonResponse({ error: "Student not found." }, 404);
    const recordId = crypto.randomUUID();
    const now = new Date().toISOString();
    const newTotal = previousTotal + hours;
    const response = { ok: true, id: recordId, previousTotal, newTotal };
    await db.batch([
      db.prepare(`INSERT INTO training_hours
        (id, student_id, entry_date, period_end, verified_hours, source, internal_note, training_location, created_at)
        VALUES (?, ?, ?, NULL, ?, 'admin_student_edit', NULL, ?, ?)`)
        .bind(recordId, studentId, now.slice(0, 10), hours, location || null, now),
      db.prepare("UPDATE students SET updated_at = ? WHERE id = ?").bind(now, studentId),
      auditStatement(db, {
        actorType: "administrator", ...adminAuditMetadata(session, request), action: "training_hours_added", entityType: "training_hours", entityId: recordId,
        studentId, previousValues: { totalHours: previousTotal }, newValues: { hoursAdded: hours, location: location || null, totalHours: newTotal },
        source: "admin_student_edit", requestId, summary: `Added ${hours} training hours${location ? ` at ${location}` : ""} (${previousTotal} → ${newTotal})`, createdAt: now,
      }),
      db.prepare("INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'administrator', 'training_hours_added', ?, ?)")
        .bind(requestId, JSON.stringify(response), now),
    ]);
    return jsonResponse(response, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Training hours could not be added.";
    return jsonResponse({ error: message.includes("UNIQUE") ? "This hours update was already applied." : message }, message.includes("UNIQUE") ? 409 : 400);
  }
};
