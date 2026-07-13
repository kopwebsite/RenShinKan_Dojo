import { jsonResponse } from "../../_lib/auth";
import {
  audit,
  enforceLookupRateLimit,
  ensureOwnerShareUrl,
  genericLookupFailure,
  issueStudentAccessSession,
  normalizeStudentId,
  publicStudentRecord,
  requestIdentifier,
  requireStudentDb,
  studentCredentialHashes,
  type StudentEnv,
  type StudentRow,
  verifyTurnstile,
} from "../../_lib/studentRecords";

type Env = StudentEnv;
type Payload = { name?: unknown; studentId?: unknown; code?: unknown; turnstileToken?: unknown };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!(await enforceLookupRateLimit(request, env))) return genericLookupFailure(429);
    const payload = await request.json<Payload>();
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const studentId = normalizeStudentId(typeof payload.studentId === "string" ? payload.studentId : typeof payload.code === "string" ? payload.code : "");
    const token = typeof payload.turnstileToken === "string" ? payload.turnstileToken : "";
    if (!name || name.length > 120 || studentId.length < 3 || studentId.length > 80) return genericLookupFailure();
    if (!(await verifyTurnstile(request, env, token))) return genericLookupFailure();
    const { nameHash, codeHash } = await studentCredentialHashes(env, name, studentId);
    const db = requireStudentDb(env);
    const student = await db.prepare(`SELECT id, public_student_id, display_name, current_belt, belt_color,
      profile_image_url, profile_image_consent, public_visible, active, profile_status, share_fields, dojo_name,
      training_hours_adjustment, updated_at, student_pin_hash
      FROM students WHERE name_verification_hash = ? AND (UPPER(public_student_id) = ? OR lookup_code_hash = ?)
      AND active = 1 AND public_visible = 1 AND profile_status = 'approved' LIMIT 1`)
      .bind(nameHash, studentId, codeHash).first<StudentRow & { student_pin_hash: string | null }>();
    if (!student) return genericLookupFailure();
    const requestId = requestIdentifier(request);
    const selfServiceAvailable = Boolean(student.student_pin_hash);
    const [record, share, accessToken] = await Promise.all([
      publicStudentRecord(db, student),
      ensureOwnerShareUrl(db, env, student.id, request),
      selfServiceAvailable ? issueStudentAccessSession(db, student.id, requestId) : Promise.resolve(null),
    ]);
    if (share.created) {
      await audit(db, {
        actorType: "system", actorIdentifier: "student_lookup", action: "qr_link_created", entityType: "share_token", entityId: student.id,
        studentId: student.id, newValues: { purpose: "owner" }, source: "student_record_lookup", requestId,
        summary: `Created a compatible public profile QR link for ${student.public_student_id}`,
      });
    }
    return jsonResponse(
      { record, shareUrl: share.url, accessToken, selfServiceAvailable },
      200,
      { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    );
  } catch {
    return genericLookupFailure();
  }
};

export const onRequestGet: PagesFunction = async () => new Response("Method not allowed", { status: 405, headers: { Allow: "POST", "X-Robots-Tag": "noindex, nofollow" } });
