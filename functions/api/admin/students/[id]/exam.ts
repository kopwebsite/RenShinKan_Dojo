import { hasValidAdminSession, isSameOriginRequest, jsonResponse } from "../../../../_lib/auth";
import { audit, requireStudentDb, type StudentEnv } from "../../../../_lib/studentRecords";
type Env = StudentEnv & { SESSION_SECRET?: string };
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!isSameOriginRequest(request) || !(await hasValidAdminSession(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const body = await request.json<any>(); const id = String(params.id); const date = String(body.date || ""); const belt = String(body.belt || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !belt) return jsonResponse({ error: "Choose an examination date and belt or rank." }, 400);
  const db = requireStudentDb(env); const examId = crypto.randomUUID(); const now = new Date().toISOString(); const color = String(body.beltColor || "white");
  const statements = [db.prepare("INSERT INTO belt_examinations (id, student_id, examination_date, belt_awarded, belt_color, rank, examiner, public_notes, internal_notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(examId, id, date, belt, color, body.rank || null, body.examiner || null, body.publicNotes || null, body.internalNotes || null, now)];
  if (body.updateCurrentBelt !== false) statements.push(db.prepare("UPDATE students SET current_belt = ?, belt_color = ?, updated_at = ? WHERE id = ?").bind(belt, color, now, id));
  await db.batch(statements); await audit(db, "create", "belt_examination", examId, `Recorded ${belt} examination`); return jsonResponse({ ok: true, id: examId }, 201);
};
