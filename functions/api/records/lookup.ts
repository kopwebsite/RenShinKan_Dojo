import { jsonResponse } from "../../_lib/auth";
import {
  audit,
  enforceLookupRateLimit,
  ensureOwnerShareUrl,
  genericLookupFailure,
  issueStudentAccessSession,
  namesLikelyMatch,
  normalizeStudentId,
  ownerStudentRecord,
  requestIdentifier,
  requireStudentDb,
  type StudentEnv,
  type StudentRow,
  verifyTurnstile,
  verifyStudentAccessCode,
} from "../../_lib/studentRecords";

type Env = StudentEnv;
type Payload = { name?: unknown; studentId?: unknown; accessCode?: unknown; turnstileToken?: unknown };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdentifier(request);
  try {
    if (!(await enforceLookupRateLimit(request, env))) return genericLookupFailure(429);
    const payload = await request.json<Payload>();
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const studentId = normalizeStudentId(typeof payload.studentId === "string" ? payload.studentId : "");
    const accessCode = typeof payload.accessCode === "string" ? payload.accessCode : "";
    const token = typeof payload.turnstileToken === "string" ? payload.turnstileToken : "";
    if (!name || name.length > 120 || studentId.length < 3 || studentId.length > 80) return genericLookupFailure();
    if (!(await enforceLookupRateLimit(request, env, studentId))) return genericLookupFailure(429);
    if (!(await verifyTurnstile(request, env, token, "student-records"))) return genericLookupFailure();
    const db = requireStudentDb(env);
    const student = await db.prepare(`SELECT s.id, s.public_student_id, s.display_name, s.english_name, s.thai_name,
      s.account_created_date, s.dojo_joined_date, s.current_belt, s.belt_color,
      s.profile_image_url, s.profile_image_consent, s.public_visible, s.active, s.profile_status, s.share_fields, s.dojo_name,
      s.training_hours_adjustment, s.updated_at, s.created_at, s.dojo_id, s.aat_number, s.aat_last_paid_date,
      s.practice_duration, s.profile_reviewed_at, s.profile_student_visible_note,
      d.logo_url AS dojo_logo
      FROM students s LEFT JOIN dojos d ON d.id = s.dojo_id WHERE s.public_student_id = ?
      AND s.active = 1 AND s.public_visible = 1 AND s.profile_status = 'approved' LIMIT 1`)
      .bind(studentId).first<StudentRow>();
    if (!student || !namesLikelyMatch(name, student.display_name)) return genericLookupFailure();
    const privateAccess = await db.prepare(`SELECT code_hash FROM student_private_access
      WHERE student_id = ? AND revoked_at IS NULL LIMIT 1`).bind(student.id).first<{ code_hash: string }>();
    if (privateAccess && !(await verifyStudentAccessCode(env, student.id, accessCode, privateAccess.code_hash))) {
      return genericLookupFailure();
    }
    const record = await ownerStudentRecord(db, student);
    const [share, accessToken] = await Promise.all([
      ensureOwnerShareUrl(db, env, student.id, request),
      issueStudentAccessSession(db, student.id, requestId),
    ]);
    if (privateAccess) {
      await db.prepare("UPDATE student_private_access SET last_used_at = ?, updated_at = ? WHERE student_id = ? AND revoked_at IS NULL")
        .bind(new Date().toISOString(), new Date().toISOString(), student.id).run();
    }
    if (share.created) {
      await audit(db, {
        actorType: "system", actorIdentifier: "student_lookup", action: "qr_link_created", entityType: "share_token", entityId: student.id,
        studentId: student.id, newValues: { purpose: "owner" }, source: "student_record_lookup", requestId,
        summary: `Created a compatible public profile QR link for ${student.public_student_id}`,
      });
    }
    return jsonResponse(
      { record: { ...record, studentAccessToken: accessToken }, shareUrl: share.url, accessToken },
      200,
      { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    );
  } catch (error) {
    console.error("Student record lookup failed", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return genericLookupFailure();
  }
};

export const onRequestGet: PagesFunction = async () => new Response("Method not allowed", { status: 405, headers: { Allow: "POST", "X-Robots-Tag": "noindex, nofollow" } });
