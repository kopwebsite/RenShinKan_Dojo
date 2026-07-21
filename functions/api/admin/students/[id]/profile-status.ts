import { getAdminSession, isSameOriginRequest, jsonResponse } from "../../../../_lib/auth";
import {
  adminAuditMetadata,
  assertStudentAccess,
  auditStatement,
  currentBangkokMonthKey,
  encryptCapabilityToken,
  randomToken,
  requestIdentifier,
  requireStudentDb,
  sha256Hex,
  type StudentEnv,
} from "../../../../_lib/studentRecords";
import { datedProfileKey, type R2Bucket } from "../../../../_lib/storage";

type Env = StudentEnv & { SESSION_SECRET?: string; MEDIA_BUCKET?: R2Bucket };

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const requestId = requestIdentifier(request);
  let approvedKey = "";
  try {
    const body = await request.json<{ action?: unknown; note?: unknown }>();
    const action = body.action === "approve" || body.action === "reject" ? body.action : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
    if (!action) return jsonResponse({ error: "Choose approve or reject." }, 400);
    if (action === "reject" && !note) return jsonResponse({ error: "Add a short note explaining the rejection." }, 400);
    const db = requireStudentDb(env);
    const id = String(params.id);
    const access = await assertStudentAccess(db, session, id);
    if (!access.ok) return jsonResponse({ error: access.error }, access.status);
    const existing = await db.prepare("SELECT id, public_student_id, display_name, current_belt, profile_status, pending_profile_image_key, profile_image_url FROM students WHERE id = ? LIMIT 1")
      .bind(id).first<{ id: string; public_student_id: string; display_name: string; current_belt: string; profile_status: string; pending_profile_image_key: string | null; profile_image_url: string | null }>();
    if (!existing) return jsonResponse({ error: "Profile request not found." }, 404);
    if (existing.profile_status !== "pending_admin_approval") return jsonResponse({ error: "This profile request has already been reviewed." }, 409);
    const now = new Date().toISOString();

    if (action === "reject") {
      await db.batch([
        db.prepare("UPDATE students SET profile_status = 'rejected', active = 0, public_visible = 0, profile_review_note = ?, profile_reviewed_at = ?, profile_reviewed_by = ?, updated_at = ? WHERE id = ?")
          .bind(note, now, session.adminName, now, id),
        auditStatement(db, {
          actorType: "administrator", ...adminAuditMetadata(session, request), action: "profile_rejected", entityType: "student", entityId: id, studentId: id,
          studentPublicId: existing.public_student_id, studentNameSnapshot: existing.display_name,
          previousValues: { profileStatus: existing.profile_status }, newValues: { profileStatus: "rejected" }, source: "admin_profile_review", requestId,
          administratorNote: note, summary: `Rejected profile request ${existing.public_student_id}`, createdAt: now,
        }),
      ]);
      return jsonResponse({ ok: true, status: "rejected" });
    }

    if (!env.MEDIA_BUCKET || !existing.pending_profile_image_key) return jsonResponse({ error: "The submitted profile picture is unavailable." }, 409);
    const pendingObject = await env.MEDIA_BUCKET.get(existing.pending_profile_image_key);
    if (!pendingObject) return jsonResponse({ error: "The submitted profile picture is unavailable." }, 409);
    approvedKey = datedProfileKey("student-profiles");
    await env.MEDIA_BUCKET.put(approvedKey, pendingObject.body, {
      httpMetadata: { contentType: "image/webp", cacheControl: "private, max-age=3600" },
      customMetadata: { approvedAt: now, purpose: "student-profile", source: "profile-request" },
    });
    const token = randomToken();
    const cycle = await db.prepare("SELECT id FROM examination_cycles WHERE status = 'active' ORDER BY created_at DESC LIMIT 1")
      .first<{ id: string }>();
    const currentMonth = currentBangkokMonthKey();
    const contributionPeriod = await db.prepare("SELECT month_key FROM contribution_periods WHERE month_key = ? LIMIT 1")
      .bind(currentMonth).first<{ month_key: string }>();
    await db.batch([
      db.prepare(`UPDATE students SET profile_status = 'approved', active = 1, public_visible = 1,
        profile_image_url = ?, pending_profile_image_key = NULL, profile_review_note = ?, profile_reviewed_at = ?,
        profile_reviewed_by = ?, updated_at = ? WHERE id = ?`)
        .bind(`/uploads/${approvedKey}`, note, now, session.adminName, now, id),
      db.prepare("INSERT INTO share_tokens (id, token_hash, student_id, active, created_at, token_ciphertext, purpose) VALUES (?, ?, ?, 1, ?, ?, 'owner')")
        .bind(crypto.randomUUID(), await sha256Hex(token), id, now, await encryptCapabilityToken(env, token)),
      ...(cycle ? [db.prepare(`INSERT OR IGNORE INTO exam_cycle_student_status (
        id, student_id, cycle_id, student_name_snapshot, student_public_id_snapshot,
        current_rank_snapshot, status, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'not_signed_up', ?, ?)`)
        .bind(crypto.randomUUID(), id, cycle.id, existing.display_name, existing.public_student_id, existing.current_belt, now, session.adminName)] : []),
      ...(contributionPeriod ? [
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
        actorType: "administrator", ...adminAuditMetadata(session, request), action: "profile_approved", entityType: "student", entityId: id, studentId: id,
        studentPublicId: existing.public_student_id, studentNameSnapshot: existing.display_name,
        previousValues: { profileStatus: existing.profile_status, active: false, publicVisible: false },
        newValues: { profileStatus: "approved", active: true, publicVisible: true, profileImageUrl: `/uploads/${approvedKey}` },
        source: "admin_profile_review", requestId, administratorNote: note || null,
        summary: `Approved profile request ${existing.public_student_id}`, createdAt: now,
      }),
      auditStatement(db, {
        actorType: "system", actorIdentifier: "profile_approval", action: "qr_link_created", entityType: "share_token", entityId: id, studentId: id,
        studentPublicId: existing.public_student_id, studentNameSnapshot: existing.display_name,
        newValues: { purpose: "owner" }, source: "admin_profile_review", requestId,
        summary: `Created an approved public profile QR link for ${existing.public_student_id}`, createdAt: now,
      }),
    ]);
    approvedKey = "";
    await env.MEDIA_BUCKET.delete(existing.pending_profile_image_key).catch(() => undefined);
    return jsonResponse({ ok: true, status: "approved" });
  } catch (error) {
    if (approvedKey && env.MEDIA_BUCKET) await env.MEDIA_BUCKET.delete(approvedKey).catch(() => undefined);
    return jsonResponse({ error: error instanceof Error ? error.message : "The profile could not be reviewed." }, 400);
  }
};
