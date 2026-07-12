import { hasValidAdminSession, isSameOriginRequest, jsonResponse } from "../../../_lib/auth";
import {
  audit,
  DEFAULT_DOJO,
  DEFAULT_SHARE_FIELDS,
  isValidStudentId,
  normalizeStudentId,
  rankColor,
  requireStudentDb,
  studentCredentialHashes,
  type StudentEnv,
} from "../../../_lib/studentRecords";
import type { R2Bucket } from "../../../_lib/storage";

type Env = StudentEnv & { SESSION_SECRET?: string; MEDIA_BUCKET?: R2Bucket };
type ExistingStudent = {
  id: string;
  public_student_id: string;
  display_name: string;
  current_belt: string;
  belt_color: string;
  profile_image_url: string | null;
  profile_image_consent: number;
  guardian_consent: number;
  public_visible: number;
  active: number;
  share_fields: string;
  dojo_name: string;
  admin_notes: string;
  training_hours_adjustment: number;
};

async function allowed(request: Request, env: Env) {
  return isSameOriginRequest(request) && await hasValidAdminSession(request, env);
}

function profileKey(value: string | null) {
  return value?.match(/^\/uploads\/(student-profiles\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.webp)$/i)?.[1] || null;
}

function profileUrl(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  return profileKey(value) ? value : undefined;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!(await allowed(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const id = String(params.id);
  const student = await db.prepare(`SELECT s.id, s.public_student_id, s.display_name, s.current_belt, s.belt_color,
    s.profile_image_url, s.profile_image_consent, s.guardian_consent, s.public_visible, s.active, s.share_fields,
    s.dojo_name, s.admin_notes, s.training_hours_adjustment, s.created_at, s.updated_at,
    COALESCE((SELECT SUM(verified_hours) FROM training_hours h WHERE h.student_id = s.id), 0) + s.training_hours_adjustment AS total_hours,
    EXISTS(SELECT 1 FROM share_tokens st WHERE st.student_id = s.id AND st.active = 1) AS sharing_active
    FROM students s WHERE s.id = ?`).bind(id).first();
  if (!student) return jsonResponse({ error: "Student not found" }, 404);
  const [exams, hours] = await db.batch([
    db.prepare("SELECT id, examination_date, belt_awarded, belt_color, rank, examiner, public_notes, internal_notes, created_at FROM belt_examinations WHERE student_id = ? ORDER BY examination_date DESC").bind(id),
    db.prepare("SELECT id, entry_date, period_end, verified_hours, source, internal_note, created_at FROM training_hours WHERE student_id = ? ORDER BY entry_date DESC").bind(id),
  ]);
  return jsonResponse({ student, examinations: exams.results || [], trainingHours: hours.results || [] }, 200, { "Cache-Control": "no-store" });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!(await allowed(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const db = requireStudentDb(env);
    const id = String(params.id);
    const body = await request.json<Record<string, unknown>>();
    const existing = await db.prepare("SELECT id, public_student_id, display_name, current_belt, belt_color, profile_image_url, profile_image_consent, guardian_consent, public_visible, active, share_fields, dojo_name, admin_notes, training_hours_adjustment FROM students WHERE id = ?")
      .bind(id).first<ExistingStudent>();
    if (!existing) return jsonResponse({ error: "Student not found" }, 404);

    const name = String(body.displayName ?? existing.display_name).normalize("NFKC").trim().replace(/\s+/g, " ");
    const studentId = normalizeStudentId(String(body.studentId ?? existing.public_student_id));
    const currentBelt = String(body.currentBelt ?? existing.current_belt).trim();
    const dojoName = String(body.dojoName ?? existing.dojo_name ?? DEFAULT_DOJO).normalize("NFKC").trim().replace(/\s+/g, " ");
    const adminNotes = String(body.adminNotes ?? existing.admin_notes ?? "").trim();
    const image = body.profileImageUrl === undefined ? existing.profile_image_url : profileUrl(body.profileImageUrl);
    const sumRow = await db.prepare("SELECT COALESCE(SUM(verified_hours), 0) AS recorded FROM training_hours WHERE student_id = ?").bind(id).first<{ recorded: number }>();
    const recordedHours = Number(sumRow?.recorded || 0);
    const currentTrainingHours = body.currentTrainingHours === undefined
      ? recordedHours + Number(existing.training_hours_adjustment || 0)
      : Number(body.currentTrainingHours);

    if (!name || name.length > 120) return jsonResponse({ error: "Enter a student name of 120 characters or fewer." }, 400);
    if (!currentBelt || currentBelt.length > 80) return jsonResponse({ error: "Enter a current kyu or dan rank." }, 400);
    if (!dojoName || dojoName.length > 120) return jsonResponse({ error: "Enter a dojo affiliation." }, 400);
    if (adminNotes.length > 5_000) return jsonResponse({ error: "Additional information must be 5,000 characters or fewer." }, 400);
    if (!Number.isFinite(currentTrainingHours) || currentTrainingHours < 0 || currentTrainingHours > 1_000_000) return jsonResponse({ error: "Current training hours must be zero or a positive number." }, 400);
    if (image === undefined) return jsonResponse({ error: "The profile image location is invalid." }, 400);
    if (studentId !== existing.public_student_id && !isValidStudentId(studentId)) return jsonResponse({ error: "Student ID must use the format RSK-0001." }, 400);

    if (studentId !== existing.public_student_id) {
      const duplicate = await db.prepare("SELECT id FROM students WHERE UPPER(public_student_id) = ? AND id <> ? LIMIT 1").bind(studentId, id).first();
      if (duplicate) return jsonResponse({ error: "That Student ID is already in use." }, 409);
    }

    const hashes = await studentCredentialHashes(env, name, studentId);
    const now = new Date().toISOString();
    const shareFields = JSON.stringify(body.shareFields && typeof body.shareFields === "object" ? body.shareFields : (() => {
      try { return JSON.parse(existing.share_fields); } catch { return DEFAULT_SHARE_FIELDS; }
    })());

    await db.prepare(`UPDATE students SET
      public_student_id = ?, name_verification_hash = ?, display_name = ?, current_belt = ?, belt_color = ?,
      profile_image_url = ?, profile_image_consent = ?, guardian_consent = ?, public_visible = ?, active = ?,
      share_fields = ?, dojo_name = ?, admin_notes = ?, training_hours_adjustment = ?, updated_at = ?
      WHERE id = ?`)
      .bind(
        studentId, hashes.nameHash, name, currentBelt, rankColor(currentBelt, existing.belt_color), image,
        body.profileImageConsent === undefined ? existing.profile_image_consent : body.profileImageConsent ? 1 : 0,
        body.guardianConsent === undefined ? existing.guardian_consent : body.guardianConsent ? 1 : 0,
        body.publicVisible === undefined ? existing.public_visible : body.publicVisible ? 1 : 0,
        body.active === undefined ? existing.active : body.active ? 1 : 0,
        shareFields, dojoName, adminNotes, currentTrainingHours - recordedHours, now, id,
      ).run();

    if (studentId !== existing.public_student_id && isValidStudentId(studentId)) {
      await db.prepare("UPDATE student_id_sequence SET last_number = MAX(last_number, ?) WHERE sequence_name = 'student'")
        .bind(Number(studentId.slice(4))).run();
    }

    await audit(db, "update", "student", id, "Updated student identity, training balance, and visibility settings");
    const oldProfileKey = profileKey(existing.profile_image_url);
    if (env.MEDIA_BUCKET && oldProfileKey && existing.profile_image_url !== image) {
      await env.MEDIA_BUCKET.delete(oldProfileKey);
    }
    return jsonResponse({ ok: true, studentId });
  } catch (error) {
    const duplicate = error instanceof Error && error.message.includes("UNIQUE");
    return jsonResponse({ error: duplicate ? "That Student ID is already in use." : "The student record could not be saved." }, duplicate ? 409 : 400);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!(await allowed(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const id = String(params.id);
  const existing = await db.prepare("SELECT public_student_id, display_name, profile_image_url FROM students WHERE id = ?").bind(id)
    .first<{ public_student_id: string; display_name: string; profile_image_url: string | null }>();
  if (!existing) return jsonResponse({ error: "Student not found" }, 404);

  const now = new Date().toISOString();
  await db.batch([
    db.prepare("DELETE FROM students WHERE id = ?").bind(id),
    db.prepare("INSERT INTO audit_log (id, admin_action, record_type, record_id, action_summary, created_at) VALUES (?, 'delete', 'student', ?, ?, ?)")
      .bind(crypto.randomUUID(), id, `Permanently deleted ${existing.public_student_id}: ${existing.display_name}`.slice(0, 300), now),
  ]);
  const key = profileKey(existing.profile_image_url);
  if (env.MEDIA_BUCKET && key) await env.MEDIA_BUCKET.delete(key);
  return jsonResponse({ ok: true });
};
