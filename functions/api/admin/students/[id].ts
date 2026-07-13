import { normalizeRank } from "../../../../shared/ranks";
import { hasValidAdminSession, isSameOriginRequest, jsonResponse } from "../../../_lib/auth";
import {
  audit,
  DEFAULT_DOJO,
  DEFAULT_SHARE_FIELDS,
  hashStudentPin,
  isValidStudentId,
  normalizeStudentId,
  rankColor,
  requestIdentifier,
  requireStudentDb,
  studentCredentialHashes,
  type StudentEnv,
} from "../../../_lib/studentRecords";
import type { R2Bucket } from "../../../_lib/storage";

type Env = StudentEnv & { SESSION_SECRET?: string; MEDIA_BUCKET?: R2Bucket };
type ExistingStudent = {
  id: string; public_student_id: string; display_name: string; current_belt: string; belt_color: string;
  profile_image_url: string | null; profile_image_consent: number; guardian_consent: number; public_visible: number;
  active: number; share_fields: string; dojo_name: string; admin_notes: string; training_hours_adjustment: number;
  profile_status: string; practice_duration: string; profile_bio: string; student_pin_hash: string | null;
  pending_profile_image_key: string | null; profile_review_note: string;
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
  const student = await db.prepare(`SELECT s.*,
    COALESCE((SELECT SUM(verified_hours) FROM training_hours h WHERE h.student_id = s.id), 0) + s.training_hours_adjustment AS total_hours,
    EXISTS(SELECT 1 FROM share_tokens st WHERE st.student_id = s.id AND st.active = 1) AS sharing_active
    FROM students s WHERE s.id = ?`).bind(id).first<Record<string, unknown>>();
  if (!student) return jsonResponse({ error: "Student not found" }, 404);
  if (student.pending_profile_image_key) student.pending_profile_image_url = `/api/admin/students/${encodeURIComponent(id)}/pending-image`;
  delete student.lookup_code_hash;
  delete student.name_verification_hash;
  delete student.student_pin_hash;
  const [exams, hours, applications, hourRequests] = await db.batch([
    db.prepare(`SELECT id, examination_date, belt_awarded, belt_color, rank, examiner, public_notes, internal_notes,
      COALESCE(rank_before, '') AS rank_before,
      COALESCE(rank_attempted, rank, belt_awarded, '') AS rank_attempted,
      passed,
      COALESCE(examination_location, '') AS examination_location,
      COALESCE(rank_after,
        CASE WHEN passed = 1 THEN COALESCE(rank_attempted, rank, belt_awarded)
             ELSE COALESCE(rank_before, rank, belt_awarded) END,
        '') AS rank_after,
      administrator_id,
      COALESCE(examination_timestamp, created_at) AS examination_timestamp,
      bulk_operation_id, created_at FROM belt_examinations WHERE student_id = ?
      ORDER BY COALESCE(examination_timestamp, created_at) DESC, examination_date DESC`).bind(id),
    db.prepare("SELECT id, entry_date, period_end, verified_hours, source, internal_note, created_at FROM training_hours WHERE student_id = ? ORDER BY created_at DESC").bind(id),
    db.prepare(`SELECT ea.*, ec.name AS cycle_name,
      (SELECT json_group_array(json_object('id', h.id, 'previousStatus', h.previous_status, 'newStatus', h.new_status,
        'previousPaymentStatus', h.previous_payment_status, 'newPaymentStatus', h.new_payment_status,
        'actorIdentifier', h.actor_identifier, 'note', h.note, 'createdAt', h.created_at))
       FROM application_status_history h WHERE h.application_id = ea.id) AS history_json
      FROM examination_applications ea JOIN examination_cycles ec ON ec.id = ea.cycle_id
      WHERE ea.student_id = ? ORDER BY ea.submitted_at DESC`).bind(id),
    db.prepare("SELECT * FROM training_hour_requests WHERE student_id = ? ORDER BY submitted_at DESC").bind(id),
  ]);
  const applicationRows = (applications.results || []).map((value) => {
    const row = value as Record<string, unknown>;
    try { row.answers = JSON.parse(String(row.answers_json || "{}")); } catch { row.answers = {}; }
    try { row.history = JSON.parse(String(row.history_json || "[]")); } catch { row.history = []; }
    delete row.answers_json;
    delete row.history_json;
    return row;
  });
  return jsonResponse({ student, examinations: exams.results || [], trainingHours: hours.results || [], applications: applicationRows, hourRequests: hourRequests.results || [] }, 200, { "Cache-Control": "no-store" });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!(await allowed(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const requestId = requestIdentifier(request);
  try {
    const db = requireStudentDb(env);
    const id = String(params.id);
    const body = await request.json<Record<string, unknown>>();
    const existing = await db.prepare(`SELECT id, public_student_id, display_name, current_belt, belt_color, profile_image_url,
      profile_image_consent, guardian_consent, public_visible, active, share_fields, dojo_name, admin_notes,
      training_hours_adjustment, profile_status, practice_duration, profile_bio, student_pin_hash,
      pending_profile_image_key, profile_review_note FROM students WHERE id = ?`).bind(id).first<ExistingStudent>();
    if (!existing) return jsonResponse({ error: "Student not found" }, 404);

    const name = String(body.displayName ?? existing.display_name).normalize("NFKC").trim().replace(/\s+/g, " ");
    const studentId = normalizeStudentId(String(body.studentId ?? existing.public_student_id));
    const currentBelt = normalizeRank(body.currentBelt ?? existing.current_belt);
    const dojoName = String(body.dojoName ?? existing.dojo_name ?? DEFAULT_DOJO).normalize("NFKC").trim().replace(/\s+/g, " ");
    const adminNotes = String(body.adminNotes ?? existing.admin_notes ?? "").trim();
    const practiceDuration = String(body.practiceDuration ?? existing.practice_duration ?? "").trim();
    const profileBio = String(body.profileBio ?? existing.profile_bio ?? "").trim();
    const image = body.profileImageUrl === undefined ? existing.profile_image_url : profileUrl(body.profileImageUrl);
    const sumRow = await db.prepare("SELECT COALESCE(SUM(verified_hours), 0) AS recorded FROM training_hours WHERE student_id = ?").bind(id).first<{ recorded: number }>();
    const recordedHours = Number(sumRow?.recorded || 0);
    const previousTotal = recordedHours + Number(existing.training_hours_adjustment || 0);
    const currentTrainingHours = body.currentTrainingHours === undefined ? previousTotal : Number(body.currentTrainingHours);

    if (!name || name.length > 120) return jsonResponse({ error: "Enter a student name of 120 characters or fewer." }, 400);
    if (!currentBelt) return jsonResponse({ error: "Choose a valid rank from the official progression." }, 400);
    if (!dojoName || dojoName.length > 120) return jsonResponse({ error: "Enter a dojo affiliation." }, 400);
    if (adminNotes.length > 5_000 || profileBio.length > 2_000 || practiceDuration.length > 120) return jsonResponse({ error: "One or more text fields are too long." }, 400);
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
    const newPinHash = body.studentPin ? await hashStudentPin(String(body.studentPin)) : existing.student_pin_hash;
    const next = {
      publicStudentId: studentId, displayName: name, currentRank: currentBelt, profileImageUrl: image,
      profileImageConsent: body.profileImageConsent === undefined ? existing.profile_image_consent : body.profileImageConsent ? 1 : 0,
      guardianConsent: body.guardianConsent === undefined ? existing.guardian_consent : body.guardianConsent ? 1 : 0,
      publicVisible: body.publicVisible === undefined ? existing.public_visible : body.publicVisible ? 1 : 0,
      active: body.active === undefined ? existing.active : body.active ? 1 : 0,
      dojoName, adminNotes, practiceDuration, profileBio, totalHours: currentTrainingHours,
    };

    await db.prepare(`UPDATE students SET public_student_id = ?, lookup_code_hash = ?, name_verification_hash = ?,
      display_name = ?, current_belt = ?, belt_color = ?, profile_image_url = ?, profile_image_consent = ?,
      guardian_consent = ?, public_visible = ?, active = ?, share_fields = ?, dojo_name = ?, admin_notes = ?,
      practice_duration = ?, profile_bio = ?, student_pin_hash = ?, training_hours_adjustment = ?, updated_at = ? WHERE id = ?`)
      .bind(studentId, hashes.codeHash, hashes.nameHash, name, currentBelt, rankColor(currentBelt, existing.belt_color), image,
        next.profileImageConsent, next.guardianConsent, next.publicVisible, next.active, shareFields, dojoName, adminNotes,
        practiceDuration, profileBio, newPinHash, currentTrainingHours - recordedHours, now, id).run();
    if (studentId !== existing.public_student_id && isValidStudentId(studentId)) {
      await db.prepare("UPDATE student_id_sequence SET last_number = MAX(last_number, ?) WHERE sequence_name = 'student'").bind(Number(studentId.slice(4))).run();
    }
    await audit(db, {
      actorType: "administrator", actorIdentifier: "primary_admin", action: "student_updated", entityType: "student", entityId: id,
      studentId: id, previousValues: { publicStudentId: existing.public_student_id, displayName: existing.display_name, currentRank: existing.current_belt,
        profileImageUrl: existing.profile_image_url, active: existing.active, totalHours: previousTotal }, newValues: next,
      source: "admin_student_edit", requestId, summary: `Updated ${studentId}${body.studentPin ? " and reset student PIN" : ""}`, createdAt: now,
    });
    const oldProfileKey = profileKey(existing.profile_image_url);
    if (env.MEDIA_BUCKET && oldProfileKey && existing.profile_image_url !== image) await env.MEDIA_BUCKET.delete(oldProfileKey);
    return jsonResponse({ ok: true, studentId });
  } catch (error) {
    const duplicate = error instanceof Error && error.message.includes("UNIQUE");
    return jsonResponse({ error: duplicate ? "That Student ID is already in use." : error instanceof Error ? error.message : "The student record could not be saved." }, duplicate ? 409 : 400);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!(await allowed(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const id = String(params.id);
  const existing = await db.prepare("SELECT public_student_id, display_name, active FROM students WHERE id = ?").bind(id)
    .first<{ public_student_id: string; display_name: string; active: number }>();
  if (!existing) return jsonResponse({ error: "Student not found" }, 404);
  const requestId = requestIdentifier(request);
  const now = new Date().toISOString();
  await db.prepare("UPDATE students SET active = 0, public_visible = 0, updated_at = ? WHERE id = ?").bind(now, id).run();
  await audit(db, {
    actorType: "administrator", actorIdentifier: "primary_admin", action: "profile_deactivated", entityType: "student", entityId: id,
    studentId: id, previousValues: { active: Boolean(existing.active) }, newValues: { active: false, publicVisible: false },
    source: "admin_students", requestId, summary: `Archived ${existing.public_student_id}: ${existing.display_name}`, createdAt: now,
  });
  return jsonResponse({ ok: true, archived: true });
};
