import { getAuthorizedAdminSession, isSameOriginRequest, jsonResponse } from "../../../../_lib/auth";
import {
  adminAuditMetadata,
  assertStudentAccess,
  auditStatement,
  generateStudentAccessCode,
  requestIdentifier,
  requireStudentDb,
  studentAccessCodeHash,
  type StudentEnv,
} from "../../../../_lib/studentRecords";

export const onRequestPost: PagesFunction<StudentEnv> = async ({ request, env, params }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const db = requireStudentDb(env);
  const studentId = String(params.id || "");
  const access = await assertStudentAccess(db, session, studentId);
  if (!access.ok) return jsonResponse({ error: access.error }, access.status);
  const student = await db.prepare("SELECT public_student_id, display_name FROM students WHERE id = ? LIMIT 1")
    .bind(studentId).first<{ public_student_id: string; display_name: string }>();
  if (!student) return jsonResponse({ error: "Student not found" }, 404);
  const code = generateStudentAccessCode();
  const codeHash = await studentAccessCodeHash(env, studentId, code);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO student_private_access
      (student_id, code_hash, issued_at, issued_by_account_id, revoked_at, last_used_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, NULL, ?)
      ON CONFLICT(student_id) DO UPDATE SET code_hash = excluded.code_hash,
        issued_at = excluded.issued_at, issued_by_account_id = excluded.issued_by_account_id,
        revoked_at = NULL, last_used_at = NULL, updated_at = excluded.updated_at`)
      .bind(studentId, codeHash, now, session.accountId, now),
    auditStatement(db, {
      actorType: "administrator",
      ...adminAuditMetadata(session, request),
      action: "student_private_access_reissued",
      entityType: "student_private_access",
      entityId: studentId,
      studentId,
      newValues: { studentPublicId: student.public_student_id, codeRotated: true },
      source: "admin_student_workspace",
      requestId: requestIdentifier(request),
      summary: `Issued a new private record access code for ${student.display_name}`,
      createdAt: now,
    }),
  ]);
  return jsonResponse({ ok: true, code, studentId: student.public_student_id }, 200, {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  });
};
