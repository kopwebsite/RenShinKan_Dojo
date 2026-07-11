import { hasValidAdminSession, isSameOriginRequest, jsonResponse } from "../../../_lib/auth";
import { audit, requireStudentDb, studentCredentialHashes, type StudentEnv } from "../../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string };

async function allowed(request: Request, env: Env) { return isSameOriginRequest(request) && await hasValidAdminSession(request, env); }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await allowed(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const rows = await db.prepare(`SELECT s.id, s.public_student_id, s.display_name, s.current_belt, s.belt_color, s.profile_image_url, s.profile_image_consent, s.guardian_consent, s.public_visible, s.active, s.share_fields, s.dojo_name, s.created_at, s.updated_at,
    COALESCE((SELECT SUM(verified_hours) FROM training_hours h WHERE h.student_id = s.id), 0) AS total_hours,
    EXISTS(SELECT 1 FROM share_tokens st WHERE st.student_id = s.id AND st.active = 1) AS sharing_active
    FROM students s ORDER BY s.active DESC, s.display_name COLLATE NOCASE`).all();
  return jsonResponse({ students: rows.results || [] }, 200, { "Cache-Control": "no-store" });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await allowed(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json<any>();
    const displayName = String(body.displayName || "").trim();
    const studentId = String(body.studentId || "").trim();
    const lookupCode = String(body.lookupCode || "").trim();
    if (!displayName || displayName.length > 120 || !/^[A-Za-z0-9-]{3,40}$/.test(studentId) || lookupCode.length < 8) return jsonResponse({ error: "Enter a name, a valid student ID, and a lookup code of at least 8 characters." }, 400);
    const db = requireStudentDb(env);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const hashes = await studentCredentialHashes(env, displayName, lookupCode);
    await db.prepare(`INSERT INTO students (id, public_student_id, lookup_code_hash, name_verification_hash, display_name, current_belt, belt_color, profile_image_url, profile_image_consent, guardian_consent, public_visible, active, share_fields, dojo_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'RenShinKan Dojo', ?, ?)`)
      .bind(id, studentId, hashes.codeHash, hashes.nameHash, displayName, String(body.currentBelt || "Unranked"), String(body.beltColor || "white"), body.profileImageUrl || null, body.profileImageConsent ? 1 : 0, body.guardianConsent ? 1 : 0, body.publicVisible === false ? 0 : 1, JSON.stringify(body.shareFields || { photo: false, trainingHours: true, examinations: true, lastUpdated: true }), now, now).run();
    await audit(db, "create", "student", id, `Created student record ${studentId}`);
    return jsonResponse({ ok: true, id, lookupCode }, 201);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error && error.message.includes("UNIQUE") ? "That student ID is already in use." : "The student could not be added." }, 400);
  }
};
