import { getAdminSession, isSameOriginRequest, jsonResponse } from "../../../../_lib/auth";
import { adminAuditMetadata, assertStudentAccess, audit, ensureOwnerShareUrl, requestIdentifier, requireStudentDb, type StudentEnv } from "../../../../_lib/studentRecords";

type Env = StudentEnv & { SESSION_SECRET?: string; SITE_URL?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const studentId = String(params.id);
  const access = await assertStudentAccess(db, session, studentId);
  if (!access.ok) return jsonResponse({ error: access.error }, access.status);
  const student = await db.prepare("SELECT id, profile_status, active FROM students WHERE id = ?").bind(studentId)
    .first<{ id: string; profile_status: string; active: number }>();
  if (!student) return jsonResponse({ error: "Student not found." }, 404);
  if (student.profile_status !== "approved" || !student.active) return jsonResponse({ error: "Only approved active profiles can be shared." }, 409);
  const result = await ensureOwnerShareUrl(db, env, studentId, request);
  if (result.created) {
    await audit(db, {
      actorType: "administrator", ...adminAuditMetadata(session, request), action: "qr_link_created", entityType: "share_token", entityId: studentId,
      studentId, previousValues: null, newValues: { active: true, purpose: "owner" }, source: "admin_student_edit",
      requestId: requestIdentifier(request), summary: "Created approved profile QR link without revoking existing links",
    });
  }
  return jsonResponse({ ok: true, url: result.url, created: result.created }, result.created ? 201 : 200, { "Cache-Control": "no-store" });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const studentId = String(params.id);
  const access = await assertStudentAccess(db, session, studentId);
  if (!access.ok) return jsonResponse({ error: access.error }, access.status);
  const now = new Date().toISOString();
  await db.prepare("UPDATE share_tokens SET active = 0, revoked_at = ? WHERE student_id = ? AND active = 1").bind(now, studentId).run();
  await audit(db, {
    actorType: "administrator", ...adminAuditMetadata(session, request), action: "qr_links_revoked", entityType: "share_token", entityId: studentId,
    studentId, previousValues: { active: true }, newValues: { active: false }, source: "admin_student_edit",
    requestId: requestIdentifier(request), summary: "Revoked all active profile sharing links", createdAt: now,
  });
  return jsonResponse({ ok: true });
};
