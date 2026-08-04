import { getAuthorizedAdminSession, isSameOriginRequest, jsonResponse } from "../../../../_lib/auth";
import {
  adminAuditMetadata,
  assertStudentAccess,
  auditStatement,
  contributionPeriodCountStatement,
  currentBangkokMonthKey,
  requestIdentifier,
  requireStudentDb,
  type StudentEnv,
} from "../../../../_lib/studentRecords";
import { datedProfileKey, type R2Bucket } from "../../../../_lib/storage";
import { uploadsEnabled } from "../../../../_lib/operationalControls";

type Env = StudentEnv & { SESSION_SECRET?: string; MEDIA_BUCKET?: R2Bucket; UPLOADS_ENABLED?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const requestId = requestIdentifier(request);
  let approvedKey = "";
  try {
    const body = await request.json<{ action?: unknown }>();
    const action = body.action === "approve" || body.action === "reject" ? body.action : "";
    if (!action) return jsonResponse({ error: "Choose approve or reject." }, 400);
    const db = requireStudentDb(env);
    const id = String(params.id);
    const access = await assertStudentAccess(db, session, id);
    if (!access.ok) return jsonResponse({ error: access.error }, access.status);
    const existing = await db.prepare("SELECT id, public_student_id, display_name, current_belt, profile_status, pending_profile_image_key, profile_image_url, dojo_id FROM students WHERE id = ? LIMIT 1")
      .bind(id).first<{ id: string; public_student_id: string; display_name: string; current_belt: string; profile_status: string; pending_profile_image_key: string | null; profile_image_url: string | null; dojo_id: string }>();
    if (!existing) return jsonResponse({ error: "Profile request not found." }, 404);
    if (existing.profile_status !== "pending_admin_approval") return jsonResponse({ error: "This profile request has already been reviewed." }, 409);
    const now = new Date().toISOString();

    if (action === "reject") {
      await db.batch([
        db.prepare(`INSERT INTO request_decisions
          (id, request_type, request_id, decision, reviewer_identifier, decided_at)
          VALUES (?, 'profile_information', ?, 'denied', ?, ?)`)
          .bind(crypto.randomUUID(), id, session.adminName, now),
        db.prepare(`UPDATE students SET profile_status = 'rejected', active = 0, public_visible = 0,
          profile_reviewed_at = ?, profile_reviewed_by = ?, updated_at = ? WHERE id = ? AND profile_status = 'pending_admin_approval'`)
          .bind(now, session.adminName, now, id),
        auditStatement(db, {
          actorType: "administrator", ...adminAuditMetadata(session, request), action: "profile_rejected", entityType: "student", entityId: id, studentId: id,
          studentPublicId: existing.public_student_id, studentNameSnapshot: existing.display_name,
          previousValues: { profileStatus: existing.profile_status }, newValues: { profileStatus: "rejected" }, source: "admin_profile_review", requestId,
          summary: `Rejected profile request ${existing.public_student_id}`, createdAt: now,
        }),
      ]);
      return jsonResponse({ ok: true, status: "rejected" });
    }

    let approvedImageUrl = existing.profile_image_url;
    if (existing.pending_profile_image_key) {
      if (!uploadsEnabled(env)) return jsonResponse({ error: "Profile image processing is temporarily paused. The pending request is unchanged." }, 503);
      if (!env.MEDIA_BUCKET) return jsonResponse({ error: "The submitted profile picture is unavailable." }, 409);
      const pendingObject = await env.MEDIA_BUCKET.get(existing.pending_profile_image_key);
      if (!pendingObject) return jsonResponse({ error: "The submitted profile picture is unavailable." }, 409);
      approvedKey = datedProfileKey("student-profiles");
      await env.MEDIA_BUCKET.put(approvedKey, pendingObject.body, {
        httpMetadata: { contentType: "image/webp", cacheControl: "private, max-age=3600" },
        customMetadata: { approvedAt: now, purpose: "student-profile", source: "profile-request" },
      });
      approvedImageUrl = `/uploads/${approvedKey}`;
    }
    const cycle = await db.prepare("SELECT id FROM examination_cycles WHERE status = 'active' ORDER BY created_at DESC LIMIT 1")
      .first<{ id: string }>();
    const currentMonth = currentBangkokMonthKey();
    const contributionPeriod = await db.prepare("SELECT month_key FROM contribution_periods WHERE month_key = ? LIMIT 1")
      .bind(currentMonth).first<{ month_key: string }>();
    await db.batch([
      db.prepare(`INSERT INTO request_decisions
        (id, request_type, request_id, decision, reviewer_identifier, decided_at)
        VALUES (?, 'profile_information', ?, 'approved', ?, ?)`)
        .bind(crypto.randomUUID(), id, session.adminName, now),
      db.prepare(`UPDATE students SET profile_status = 'approved', active = 1, public_visible = 1,
        profile_image_url = ?, pending_profile_image_key = NULL, profile_reviewed_at = ?,
        profile_reviewed_by = ?, updated_at = ? WHERE id = ? AND profile_status = 'pending_admin_approval'`)
        .bind(approvedImageUrl, now, session.adminName, now, id),
      ...(cycle ? [db.prepare(`INSERT OR IGNORE INTO exam_cycle_student_status (
        id, student_id, cycle_id, student_name_snapshot, student_public_id_snapshot,
        current_rank_snapshot, status, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'not_signed_up', ?, ?)`)
        .bind(crypto.randomUUID(), id, cycle.id, existing.display_name, existing.public_student_id, existing.current_belt, now, session.adminName)] : []),
      ...(contributionPeriod && existing.dojo_id === "dojo-rsk" ? [
        db.prepare(`INSERT OR IGNORE INTO contribution_period_students (
          id, month_key, student_id, student_name_snapshot, student_public_id_snapshot,
          current_rank_snapshot, active_at_period_start, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`)
          .bind(crypto.randomUUID(), currentMonth, id, existing.display_name, existing.public_student_id, existing.current_belt, now),
        contributionPeriodCountStatement(db, currentMonth),
      ] : []),
      auditStatement(db, {
        actorType: "administrator", ...adminAuditMetadata(session, request), action: "profile_approved", entityType: "student", entityId: id, studentId: id,
        studentPublicId: existing.public_student_id, studentNameSnapshot: existing.display_name,
        previousValues: { profileStatus: existing.profile_status, active: true, publicVisible: true },
        newValues: { profileStatus: "approved", active: true, publicVisible: true, profileImageUrl: approvedImageUrl },
        source: "admin_profile_review", requestId,
        summary: `Approved profile request ${existing.public_student_id}`, createdAt: now,
      }),
    ]);
    approvedKey = "";
    if (env.MEDIA_BUCKET && existing.pending_profile_image_key) await env.MEDIA_BUCKET.delete(existing.pending_profile_image_key).catch(() => undefined);
    return jsonResponse({ ok: true, status: "approved" });
  } catch (error) {
    if (approvedKey && env.MEDIA_BUCKET) await env.MEDIA_BUCKET.delete(approvedKey).catch(() => undefined);
    const conflict = error instanceof Error && /(?:UNIQUE constraint|request_decisions)/i.test(error.message);
    return jsonResponse({ error: conflict ? "Another administrator has already reviewed this profile request." : error instanceof Error ? error.message : "The profile could not be reviewed." }, conflict ? 409 : 400);
  }
};
