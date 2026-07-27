import { jsonResponse } from "../../_lib/auth";
import { datedProfileKey, validateProfileWebp, type R2Bucket } from "../../_lib/storage";
import {
  auditStatement,
  normalizeStudentId,
  requestIdentifier,
  requireStudentDb,
  type StudentEnv,
  validStudentAccessSession,
} from "../../_lib/studentRecords";

type Env = StudentEnv & { MEDIA_BUCKET?: R2Bucket };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdentifier(request);
  let objectKey = "";
  try {
    const db = requireStudentDb(env);
    const replay = await db.prepare("SELECT response_json FROM mutation_requests WHERE request_id = ? LIMIT 1")
      .bind(requestId).first<{ response_json: string | null }>();
    if (replay?.response_json) return jsonResponse(JSON.parse(replay.response_json), 200, { "Cache-Control": "no-store" });
    if (!env.MEDIA_BUCKET) return jsonResponse({ error: "Profile image storage is temporarily unavailable." }, 503);
    const form = await request.formData();
    const publicStudentId = normalizeStudentId(String(form.get("studentId") || ""));
    const accessToken = String(form.get("accessToken") || "");
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) return jsonResponse({ error: "Choose a profile photo." }, 400);
    const student = await db.prepare(`SELECT id, profile_image_url FROM students
      WHERE UPPER(public_student_id) = ? AND active = 1 AND public_visible = 1
      AND profile_status = 'approved' AND deleted_at IS NULL LIMIT 1`)
      .bind(publicStudentId).first<{ id: string; profile_image_url: string | null }>();
    if (!student) return jsonResponse({ error: "The verified student session is unavailable. Look up the record again." }, 403);
    const session = await validStudentAccessSession(db, student.id, accessToken);
    if (!session) return jsonResponse({ error: "Your secure record session expired. Look up the record again before changing the photo." }, 403);
    const image = await validateProfileWebp(file, 2 * 1024 * 1024);
    objectKey = datedProfileKey("student-profiles");
    const now = new Date().toISOString();
    await env.MEDIA_BUCKET.put(objectKey, image.bytes, {
      httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: {
        uploadedAt: now, purpose: "student-owned-profile",
        studentId: student.id, width: String(image.width), height: String(image.height),
      },
    });
    const profileImage = `/uploads/${objectKey}`;
    const response = { ok: true, profileImage };
    await db.batch([
      db.prepare("UPDATE student_profile_media SET status = 'replaced', removed_at = ? WHERE student_id = ? AND status = 'active'")
        .bind(now, student.id),
      db.prepare(`INSERT INTO student_profile_media
        (id, student_id, object_key, content_type, file_size, width, height, status, created_at)
        VALUES (?, ?, ?, 'image/webp', ?, ?, ?, 'active', ?)`)
        .bind(crypto.randomUUID(), student.id, objectKey, image.bytes.byteLength, image.width, image.height, now),
      db.prepare(`UPDATE students SET profile_image_url = ?, profile_image_consent = 1, updated_at = ? WHERE id = ?`)
        .bind(profileImage, now, student.id),
      db.prepare("UPDATE student_access_sessions SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now, session.id),
      auditStatement(db, {
        actorType: "student", actorIdentifier: student.id,
        action: "profile_photo_changed", entityType: "student", entityId: student.id, studentId: student.id,
        previousValues: { profileImage: student.profile_image_url ? "present" : "not_present" },
        newValues: { objectKey, contentType: "image/webp", fileSize: image.bytes.byteLength, width: image.width, height: image.height },
        source: "student_passport", requestId, summary: "Changed student-owned profile photo", createdAt: now,
      }),
      db.prepare("INSERT INTO mutation_requests (request_id, actor_type, action, response_json, created_at) VALUES (?, 'student', 'profile_photo_changed', ?, ?)")
        .bind(requestId, JSON.stringify(response), now),
    ]);
    return jsonResponse(response, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    if (objectKey && env.MEDIA_BUCKET) await env.MEDIA_BUCKET.delete(objectKey);
    const message = error instanceof Error ? error.message : "The profile photo could not be changed.";
    return jsonResponse({ error: message.includes("UNIQUE") ? "This photo change was already submitted." : message }, message.includes("UNIQUE") ? 409 : 400, { "Cache-Control": "no-store" });
  }
};
