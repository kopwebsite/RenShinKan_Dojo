import { jsonResponse } from "../../_lib/auth";
import { enforceLookupRateLimit, genericLookupFailure, publicStudentRecord, requireStudentDb, studentCredentialHashes, type StudentEnv, verifyTurnstile } from "../../_lib/studentRecords";

type Env = StudentEnv;
type Payload = { name?: unknown; code?: unknown; turnstileToken?: unknown };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!(await enforceLookupRateLimit(request, env))) return genericLookupFailure(429);
    const payload = await request.json<Payload>();
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const code = typeof payload.code === "string" ? payload.code.trim() : "";
    const token = typeof payload.turnstileToken === "string" ? payload.turnstileToken : "";
    if (!name || name.length > 120 || code.length < 6 || code.length > 80) return genericLookupFailure();
    if (!(await verifyTurnstile(request, env, token))) return genericLookupFailure();
    const { nameHash, codeHash } = await studentCredentialHashes(env, name, code);
    const db = requireStudentDb(env);
    const student = await db.prepare("SELECT id, public_student_id, display_name, current_belt, belt_color, profile_image_url, profile_image_consent, public_visible, active, share_fields, dojo_name, updated_at FROM students WHERE name_verification_hash = ? AND lookup_code_hash = ? AND active = 1 AND public_visible = 1 LIMIT 1")
      .bind(nameHash, codeHash).first<any>();
    if (!student) return genericLookupFailure();
    return jsonResponse({ record: await publicStudentRecord(db, student) }, 200, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  } catch {
    return genericLookupFailure();
  }
};

export const onRequestGet: PagesFunction = async () => new Response("Method not allowed", { status: 405, headers: { Allow: "POST", "X-Robots-Tag": "noindex, nofollow" } });
