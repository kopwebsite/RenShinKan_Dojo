import { hasValidAdminSession, isSameOriginRequest, jsonResponse } from "../../../_lib/auth";
import { audit, requireStudentDb, studentCredentialHashes, type StudentEnv } from "../../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };
async function allowed(request: Request, env: Env) { return isSameOriginRequest(request) && await hasValidAdminSession(request, env); }

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!(await allowed(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env); const id = String(params.id);
  const student = await db.prepare("SELECT id, public_student_id, display_name, current_belt, belt_color, profile_image_url, profile_image_consent, guardian_consent, public_visible, active, share_fields, dojo_name, created_at, updated_at FROM students WHERE id = ?").bind(id).first();
  if (!student) return jsonResponse({ error: "Student not found" }, 404);
  const [exams, hours] = await db.batch([
    db.prepare("SELECT id, examination_date, belt_awarded, belt_color, rank, examiner, public_notes, internal_notes, created_at FROM belt_examinations WHERE student_id = ? ORDER BY examination_date DESC").bind(id),
    db.prepare("SELECT id, entry_date, period_end, verified_hours, source, internal_note, created_at FROM training_hours WHERE student_id = ? ORDER BY entry_date DESC").bind(id),
  ]);
  return jsonResponse({ student, examinations: exams.results || [], trainingHours: hours.results || [] }, 200, { "Cache-Control": "no-store" });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!(await allowed(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env); const id = String(params.id); const body = await request.json<any>();
  const existing = await db.prepare("SELECT display_name FROM students WHERE id = ?").bind(id).first<{ display_name: string }>();
  if (!existing) return jsonResponse({ error: "Student not found" }, 404);
  const name = String(body.displayName || existing.display_name).trim();
  const fields: unknown[] = [name, String(body.currentBelt || "Unranked"), String(body.beltColor || "white"), body.profileImageUrl || null, body.profileImageConsent ? 1 : 0, body.guardianConsent ? 1 : 0, body.publicVisible ? 1 : 0, body.active ? 1 : 0, JSON.stringify(body.shareFields || { photo: false, trainingHours: true, examinations: true, lastUpdated: true }), new Date().toISOString()];
  let query = "UPDATE students SET display_name = ?, current_belt = ?, belt_color = ?, profile_image_url = ?, profile_image_consent = ?, guardian_consent = ?, public_visible = ?, active = ?, share_fields = ?, updated_at = ?";
  if (body.lookupCode) { const hashes = await studentCredentialHashes(env, name, String(body.lookupCode)); query += ", lookup_code_hash = ?, name_verification_hash = ?"; fields.push(hashes.codeHash, hashes.nameHash); }
  else if (name !== existing.display_name) return jsonResponse({ error: "Reset the lookup code when changing the verification name." }, 400);
  query += " WHERE id = ?"; fields.push(id);
  await db.prepare(query).bind(...fields).run(); await audit(db, "update", "student", id, "Updated student record and visibility settings");
  return jsonResponse({ ok: true });
};
