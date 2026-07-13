import { normalizeRank } from "../../../../shared/ranks";
import { hasValidAdminSession, isSameOriginRequest, jsonResponse } from "../../../_lib/auth";
import {
  auditStatement,
  currentBangkokMonthKey,
  DEFAULT_DOJO,
  DEFAULT_SHARE_FIELDS,
  isValidStudentId,
  normalizeStudentId,
  rankColor,
  requestIdentifier,
  requireStudentDb,
  studentNameVerificationHash,
  type StudentEnv,
} from "../../../_lib/studentRecords";
import type { R2Bucket } from "../../../_lib/storage";

type Env = StudentEnv & { SESSION_SECRET?: string; MEDIA_BUCKET?: R2Bucket };
type ExistingStudent = {
  id: string; public_student_id: string; display_name: string; current_belt: string; belt_color: string;
  profile_image_url: string | null; profile_image_consent: number; guardian_consent: number; public_visible: number;
  active: number; share_fields: string; dojo_name: string; admin_notes: string; training_hours_adjustment: number;
  profile_status: string; practice_duration: string; profile_bio: string;
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
  const student = await db.prepare(`SELECT
    s.id, s.public_student_id, s.display_name, s.current_belt, s.belt_color,
    s.profile_image_url, s.profile_image_consent, s.guardian_consent,
    s.public_visible, s.active, s.share_fields, s.dojo_name, s.admin_notes,
    s.training_hours_adjustment, s.created_at, s.updated_at, s.profile_status,
    s.practice_duration, s.profile_bio, s.pending_profile_image_key,
    s.profile_review_note, s.archived_at, s.archived_by,
    s.public_visible_before_archive,
    COALESCE((SELECT SUM(verified_hours) FROM training_hours h WHERE h.student_id = s.id), 0) + s.training_hours_adjustment AS total_hours,
    EXISTS(SELECT 1 FROM share_tokens st WHERE st.student_id = s.id AND st.active = 1) AS sharing_active
    FROM students s WHERE s.id = ?`).bind(id).first<Record<string, unknown>>();
  if (!student) return jsonResponse({ error: "Student not found" }, 404);
  if (student.pending_profile_image_key) student.pending_profile_image_url = `/api/admin/students/${encodeURIComponent(id)}/pending-image`;
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
      training_hours_adjustment, profile_status, practice_duration, profile_bio,
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

    const nameHash = await studentNameVerificationHash(env, name);
    const now = new Date().toISOString();
    const shareFields = JSON.stringify(body.shareFields && typeof body.shareFields === "object" ? body.shareFields : (() => {
      try { return JSON.parse(existing.share_fields); } catch { return DEFAULT_SHARE_FIELDS; }
    })());
    const next = {
      publicStudentId: studentId, displayName: name, currentRank: currentBelt, profileImageUrl: image,
      profileImageConsent: body.profileImageConsent === undefined ? existing.profile_image_consent : body.profileImageConsent ? 1 : 0,
      guardianConsent: body.guardianConsent === undefined ? existing.guardian_consent : body.guardianConsent ? 1 : 0,
      publicVisible: body.publicVisible === undefined ? existing.public_visible : body.publicVisible ? 1 : 0,
      active: body.active === undefined ? existing.active : body.active ? 1 : 0,
      dojoName, adminNotes, practiceDuration, profileBio, totalHours: currentTrainingHours,
    };

    const statements = [db.prepare(`UPDATE students SET public_student_id = ?, name_verification_hash = ?,
      display_name = ?, current_belt = ?, belt_color = ?, profile_image_url = ?, profile_image_consent = ?,
      guardian_consent = ?, public_visible = ?, active = ?, share_fields = ?, dojo_name = ?, admin_notes = ?,
      practice_duration = ?, profile_bio = ?, training_hours_adjustment = ?, updated_at = ? WHERE id = ?`)
      .bind(studentId, nameHash, name, currentBelt, rankColor(currentBelt, existing.belt_color), image,
        next.profileImageConsent, next.guardianConsent, next.publicVisible, next.active, shareFields, dojoName, adminNotes,
        practiceDuration, profileBio, currentTrainingHours - recordedHours, now, id)];
    if (studentId !== existing.public_student_id && isValidStudentId(studentId)) {
      statements.push(db.prepare("UPDATE student_id_sequence SET last_number = MAX(last_number, ?) WHERE sequence_name = 'student'").bind(Number(studentId.slice(4))));
    }
    statements.push(auditStatement(db, {
      actorType: "administrator", actorIdentifier: "primary_admin", action: "student_updated", entityType: "student", entityId: id,
      studentId: id, previousValues: { publicStudentId: existing.public_student_id, displayName: existing.display_name, currentRank: existing.current_belt,
        profileImageUrl: existing.profile_image_url, active: existing.active, totalHours: previousTotal }, newValues: next,
      studentPublicId: studentId, studentNameSnapshot: name,
      source: "admin_student_edit", requestId, summary: `Updated ${studentId}`, createdAt: now,
    }));
    await db.batch(statements);
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
  const existing = await db.prepare(`SELECT public_student_id, display_name, active, public_visible, archived_at,
    profile_image_url, pending_profile_image_key FROM students WHERE id = ?`).bind(id)
    .first<{ public_student_id: string; display_name: string; active: number; public_visible: number; archived_at: string | null; profile_image_url: string | null; pending_profile_image_key: string | null }>();
  if (!existing) return jsonResponse({ error: "Student not found" }, 404);
  const body = await request.json<{ action?: unknown; confirmed?: unknown; studentId?: unknown; confirmationText?: unknown }>().catch(() => ({}));
  const requestId = requestIdentifier(request);
  const now = new Date().toISOString();

  if (body.action === "delete_permanently") {
    const expectedConfirmation = `DELETE ${existing.public_student_id}`;
    if (existing.active || !existing.archived_at) return jsonResponse({ error: "Archive the student before permanently deleting the record." }, 409);
    if (body.confirmed !== true || normalizeStudentId(String(body.studentId || "")) !== existing.public_student_id || String(body.confirmationText || "").trim() !== expectedConfirmation) {
      return jsonResponse({ error: `Type ${expectedConfirmation} to confirm permanent deletion.` }, 400);
    }
    await db.batch([
      db.prepare(`DELETE FROM contribution_status_history WHERE contribution_id IN
        (SELECT id FROM monthly_contributions WHERE student_id = ?)` ).bind(id),
      db.prepare("DELETE FROM monthly_contributions WHERE student_id = ?").bind(id),
      db.prepare("DELETE FROM contribution_period_students WHERE student_id = ?").bind(id),
      db.prepare(`DELETE FROM exam_cycle_status_history WHERE cycle_status_id IN
        (SELECT id FROM exam_cycle_student_status WHERE student_id = ?)` ).bind(id),
      db.prepare("DELETE FROM exam_cycle_student_status WHERE student_id = ?").bind(id),
      db.prepare(`DELETE FROM application_status_history WHERE application_id IN
        (SELECT id FROM examination_applications WHERE student_id = ?)` ).bind(id),
      db.prepare("DELETE FROM examination_applications WHERE student_id = ?").bind(id),
      db.prepare("DELETE FROM training_hour_requests WHERE student_id = ?").bind(id),
      db.prepare("DELETE FROM audit_log WHERE student_id = ? OR (entity_type = 'student' AND entity_id = ?)").bind(id, id),
      db.prepare("DELETE FROM operation_failures WHERE student_id = ?").bind(id),
      db.prepare("DELETE FROM students WHERE id = ? AND active = 0 AND archived_at IS NOT NULL").bind(id),
      db.prepare(`UPDATE contribution_periods SET active_student_count_snapshot =
        (SELECT COUNT(*) FROM contribution_period_students cps
         WHERE cps.month_key = contribution_periods.month_key AND cps.active_at_period_start = 1)`),
      auditStatement(db, {
        actorType: "administrator", actorIdentifier: "primary_admin", action: "student_permanently_deleted", entityType: "student", entityId: id,
        studentPublicId: existing.public_student_id, studentNameSnapshot: existing.display_name,
        previousValues: { archived: true }, newValues: { permanentlyDeleted: true },
        source: "admin_student_permanent_delete", requestId,
        summary: `Permanently deleted ${existing.public_student_id}: ${existing.display_name}`, createdAt: now,
      }),
    ]);

    const mediaKeys = Array.from(new Set([profileKey(existing.profile_image_url), existing.pending_profile_image_key].filter((value): value is string => Boolean(value))));
    let mediaCleanupPending = false;
    if (env.MEDIA_BUCKET && mediaKeys.length) {
      try {
        await env.MEDIA_BUCKET.delete(mediaKeys.length === 1 ? mediaKeys[0] : mediaKeys);
      } catch (error) {
        mediaCleanupPending = true;
        const message = error instanceof Error ? error.message : "Profile media cleanup failed after student deletion.";
        console.error(JSON.stringify({ message: "student deletion media cleanup failed", requestId, studentPublicId: existing.public_student_id, error: message }));
        try {
          await db.prepare(`INSERT INTO operation_failures
            (id, action, entity_type, entity_id, request_id, error_summary, created_at)
            VALUES (?, 'student_delete_media_cleanup', 'student', ?, ?, ?, ?)`)
            .bind(crypto.randomUUID(), id, requestId, message.slice(0, 300), now).run();
        } catch (loggingError) {
          console.error(JSON.stringify({ message: "student deletion cleanup failure could not be recorded", requestId, error: loggingError instanceof Error ? loggingError.message : String(loggingError) }));
        }
      }
    }
    return jsonResponse({ ok: true, permanentlyDeleted: true, mediaCleanupPending });
  }

  if (body.confirmed !== true || normalizeStudentId(String(body.studentId || "")) !== existing.public_student_id) {
    return jsonResponse({ error: `Confirm the archive action with Student ID ${existing.public_student_id}.` }, 400);
  }
  if (!existing.active && existing.archived_at) return jsonResponse({ ok: true, archived: true });
  if (!existing.active) return jsonResponse({ error: "Only an active student can be archived." }, 409);
  await db.batch([
    db.prepare(`UPDATE students SET active = 0, public_visible_before_archive = public_visible,
      public_visible = 0, archived_at = ?, archived_by = 'primary_admin', updated_at = ? WHERE id = ? AND active = 1`)
      .bind(now, now, id),
    auditStatement(db, {
      actorType: "administrator", actorIdentifier: "primary_admin", action: "student_archived", entityType: "student", entityId: id,
      studentId: id, studentPublicId: existing.public_student_id, studentNameSnapshot: existing.display_name,
      previousValues: { active: true, publicVisible: Boolean(existing.public_visible) }, newValues: { active: false, publicVisible: false },
      source: "admin_students", requestId, summary: `Archived ${existing.public_student_id}: ${existing.display_name}`, createdAt: now,
    }),
  ]);
  return jsonResponse({ ok: true, archived: true });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!(await allowed(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const id = String(params.id);
  const existing = await db.prepare(`SELECT public_student_id, display_name, current_belt, active, profile_status,
    public_visible_before_archive, archived_at FROM students WHERE id = ?`).bind(id)
    .first<{ public_student_id: string; display_name: string; current_belt: string; active: number; profile_status: string; public_visible_before_archive: number | null; archived_at: string | null }>();
  if (!existing) return jsonResponse({ error: "Student not found" }, 404);
  const body = await request.json<{ action?: unknown; confirmed?: unknown; studentId?: unknown }>().catch(() => ({}));
  if (body.action !== "restore" || body.confirmed !== true || normalizeStudentId(String(body.studentId || "")) !== existing.public_student_id) {
    return jsonResponse({ error: `Confirm the restore action with Student ID ${existing.public_student_id}.` }, 400);
  }
  if (existing.active) return jsonResponse({ ok: true, restored: true });
  if (!existing.archived_at) return jsonResponse({ error: "This inactive record was not archived and cannot be restored from the archive." }, 409);
  const requestId = requestIdentifier(request);
  const now = new Date().toISOString();
  const restoredVisibility = existing.profile_status === "approved" ? Number(existing.public_visible_before_archive ?? 1) : 0;
  const currentMonth = currentBangkokMonthKey();
  const contributionPeriod = await db.prepare("SELECT month_key FROM contribution_periods WHERE month_key = ? LIMIT 1")
    .bind(currentMonth).first<{ month_key: string }>();
  await db.batch([
    db.prepare(`UPDATE students SET active = 1, public_visible = ?, archived_at = NULL,
      archived_by = NULL, updated_at = ? WHERE id = ? AND active = 0`).bind(restoredVisibility, now, id),
    ...(contributionPeriod && existing.profile_status === "approved" ? [
      db.prepare(`INSERT OR IGNORE INTO contribution_period_students (
        id, month_key, student_id, student_name_snapshot, student_public_id_snapshot,
        current_rank_snapshot, active_at_period_start, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`)
        .bind(crypto.randomUUID(), currentMonth, id, existing.display_name, existing.public_student_id, existing.current_belt, now),
      db.prepare(`UPDATE contribution_periods SET active_student_count_snapshot = (
        SELECT COUNT(*) FROM contribution_period_students WHERE month_key = ? AND active_at_period_start = 1
      ) WHERE month_key = ?`).bind(currentMonth, currentMonth),
    ] : []),
    auditStatement(db, {
      actorType: "administrator", actorIdentifier: "primary_admin", action: "student_restored", entityType: "student", entityId: id,
      studentId: id, studentPublicId: existing.public_student_id, studentNameSnapshot: existing.display_name,
      previousValues: { active: false, publicVisible: false }, newValues: { active: true, publicVisible: Boolean(restoredVisibility) },
      source: "admin_students", requestId, summary: `Restored ${existing.public_student_id}: ${existing.display_name}`, createdAt: now,
    }),
  ]);
  return jsonResponse({ ok: true, restored: true });
};
