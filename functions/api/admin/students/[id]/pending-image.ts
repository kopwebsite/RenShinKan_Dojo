import { getAuthorizedAdminSession, jsonResponse } from "../../../../_lib/auth";
import { assertStudentAccess, requireStudentDb, type StudentEnv } from "../../../../_lib/studentRecords";
import type { R2Bucket } from "../../../../_lib/storage";

type Env = StudentEnv & { SESSION_SECRET?: string; MEDIA_BUCKET?: R2Bucket };

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  if (!env.MEDIA_BUCKET) return jsonResponse({ error: "Image storage is unavailable." }, 503);
  const db = requireStudentDb(env);
  const access = await assertStudentAccess(db, session, String(params.id));
  if (!access.ok) return jsonResponse({ error: access.error }, access.status);
  const student = await db.prepare("SELECT pending_profile_image_key FROM students WHERE id = ? LIMIT 1")
    .bind(String(params.id)).first<{ pending_profile_image_key: string | null }>();
  const key = student?.pending_profile_image_key || "";
  if (!/^pending-student-profiles\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.webp$/i.test(key)) return new Response("Not found", { status: 404 });
  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({ "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
};
