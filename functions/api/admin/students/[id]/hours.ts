import { hasValidAdminSession, isSameOriginRequest, jsonResponse } from "../../../../_lib/auth";
import { audit, requireStudentDb, type StudentEnv } from "../../../../_lib/studentRecords";
type Env = StudentEnv & { SESSION_SECRET?: string };
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!isSameOriginRequest(request) || !(await hasValidAdminSession(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const body = await request.json<any>(); const date = String(body.date || ""); const hours = Number(body.hours);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(hours) || hours <= 0 || hours > 1000) return jsonResponse({ error: "Enter a valid date and number of verified hours." }, 400);
  const db = requireStudentDb(env); const recordId = crypto.randomUUID(); const studentId = String(params.id); const now = new Date().toISOString();
  await db.batch([db.prepare("INSERT INTO training_hours (id, student_id, entry_date, period_end, verified_hours, source, internal_note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(recordId, studentId, date, body.periodEnd || null, hours, body.source || null, body.internalNote || null, now), db.prepare("UPDATE students SET updated_at = ? WHERE id = ?").bind(now, studentId)]);
  await audit(db, "create", "training_hours", recordId, `Added ${hours} verified training hours`); return jsonResponse({ ok: true, id: recordId }, 201);
};
