import { jsonResponse } from "../../_lib/auth";
import {
  audit,
  enforceLookupRateLimit,
  ensureOwnerShareUrl,
  genericLookupFailure,
  issueStudentAccessSession,
  namesLikelyMatch,
  normalizeStudentId,
  publicStudentRecord,
  requestIdentifier,
  requireStudentDb,
  type StudentEnv,
  type StudentRow,
  verifyTurnstile,
} from "../../_lib/studentRecords";

type Env = StudentEnv;
type Payload = { name?: unknown; studentId?: unknown; turnstileToken?: unknown };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!(await enforceLookupRateLimit(request, env))) return genericLookupFailure(429);
    const payload = await request.json<Payload>();
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const studentId = normalizeStudentId(typeof payload.studentId === "string" ? payload.studentId : "");
    const token = typeof payload.turnstileToken === "string" ? payload.turnstileToken : "";
    if (!name || name.length > 120 || studentId.length < 3 || studentId.length > 80) return genericLookupFailure();
    if (!(await verifyTurnstile(request, env, token))) return genericLookupFailure();
    const db = requireStudentDb(env);
    const student = await db.prepare(`SELECT id, public_student_id, display_name, current_belt, belt_color,
      profile_image_url, profile_image_consent, public_visible, active, profile_status, share_fields, dojo_name,
      training_hours_adjustment, updated_at
      FROM students WHERE UPPER(public_student_id) = ?
      AND active = 1 AND public_visible = 1 AND profile_status = 'approved' LIMIT 1`)
      .bind(studentId).first<StudentRow>();
    if (!student || !namesLikelyMatch(name, student.display_name)) return genericLookupFailure();
    const requestId = requestIdentifier(request);
    const [record, share, accessToken] = await Promise.all([
      publicStudentRecord(db, student),
      ensureOwnerShareUrl(db, env, student.id, request),
      issueStudentAccessSession(db, student.id, requestId),
    ]);
    if (share.created) {
      await audit(db, {
        actorType: "system", actorIdentifier: "student_lookup", action: "qr_link_created", entityType: "share_token", entityId: student.id,
        studentId: student.id, newValues: { purpose: "owner" }, source: "student_record_lookup", requestId,
        summary: `Created a compatible public profile QR link for ${student.public_student_id}`,
      });
    }
    return jsonResponse(
      { record, shareUrl: share.url, accessToken },
      200,
      { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    );
  } catch {
    return genericLookupFailure();
  }
};

export const onRequestGet: PagesFunction = async () => new Response("Method not allowed", { status: 405, headers: { Allow: "POST", "X-Robots-Tag": "noindex, nofollow" } });
