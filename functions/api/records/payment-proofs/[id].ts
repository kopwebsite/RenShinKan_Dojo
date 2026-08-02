import { isSameOriginRequest, jsonResponse } from "../../../_lib/auth";
import {
  audit,
  DEFAULT_DOJO_ID,
  normalizeStudentId,
  requestIdentifier,
  requireStudentDb,
  validStudentAccessSession,
  type StudentEnv,
} from "../../../_lib/studentRecords";
import type { R2Bucket } from "../../../_lib/storage";

type Env = StudentEnv & { MEDIA_BUCKET?: R2Bucket };

function bearerToken(request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{40,100})$/i);
  return match?.[1] || "";
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const requestId = requestIdentifier(request);
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Unauthorized" }, 401);
  if (!env.MEDIA_BUCKET) return jsonResponse({ error: "Payment-proof storage is unavailable." }, 503);

  const publicStudentId = normalizeStudentId(request.headers.get("X-Student-ID") || "");
  const db = requireStudentDb(env);
  const student = await db.prepare(`SELECT s.id, s.public_student_id, s.display_name, s.dojo_id FROM students s
    WHERE (UPPER(s.public_student_id) = ? OR EXISTS (
      SELECT 1 FROM student_id_aliases a WHERE a.student_id = s.id
      AND UPPER(a.alias_public_student_id) = ?
    )) AND s.active = 1 AND s.public_visible = 1
    AND s.profile_status IN ('pending_admin_approval', 'approved') LIMIT 1`)
    .bind(publicStudentId, publicStudentId).first<{ id: string; public_student_id: string; display_name: string; dojo_id: string }>();
  const access = student ? await validStudentAccessSession(db, student.id, bearerToken(request)) : null;
  if (!student || !access) return jsonResponse({ error: "Unauthorized" }, 401);

  const proofId = String(params.id || "");
  const proof = await db.prepare(`SELECT id, payment_type, object_key, content_type, original_filename FROM payment_proofs
    WHERE id = ? AND student_id = ? AND object_key IS NOT NULL LIMIT 1`)
    .bind(proofId, student.id).first<{ id: string; payment_type: string; object_key: string; content_type: string; original_filename: string }>();
  if (!proof || (proof.payment_type === "renshinkan_monthly" && student.dojo_id !== DEFAULT_DOJO_ID)) {
    await audit(db, {
      actorType: "student", actorIdentifier: student.public_student_id, action: "payment_proof_view_denied",
      entityType: "payment_proof", entityId: proofId || "unknown", studentId: student.id,
      studentPublicId: student.public_student_id, studentNameSnapshot: student.display_name,
      source: "student_passport", requestId, outcome: "failure", summary: "Student attempted to view an unavailable payslip",
    });
    return jsonResponse({ error: "This payslip is unavailable." }, 404);
  }

  const object = await env.MEDIA_BUCKET.get(proof.object_key);
  if (!object) return jsonResponse({ error: "This payslip file is unavailable." }, 410);
  await audit(db, {
    actorType: "student", actorIdentifier: student.public_student_id, action: "payment_proof_viewed",
    entityType: "payment_proof", entityId: proof.id, studentId: student.id,
    studentPublicId: student.public_student_id, studentNameSnapshot: student.display_name,
    source: "student_passport", requestId, outcome: "success", summary: "Student viewed a retained payslip",
  });

  const filename = (proof.original_filename || "payslip").replace(/["\\\r\n]/g, "_");
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": proof.content_type || "application/octet-stream",
    "Content-Disposition": `inline; filename="${filename}"`,
    "Content-Security-Policy": "sandbox",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  });
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { status: 200, headers });
};
