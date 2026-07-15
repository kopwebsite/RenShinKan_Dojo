import { hasValidAdminSession, isSameOriginRequest, jsonResponse } from "../../../_lib/auth";
import { datedProfileKey, validateProfileWebp, type R2Bucket } from "../../../_lib/storage";

type Env = { SESSION_SECRET?: string; MEDIA_BUCKET?: R2Bucket };

function uploadedProfileKey(value: unknown) {
  return typeof value === "string"
    ? value.match(/^\/uploads\/(student-profiles\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.webp)$/i)?.[1] || null
    : null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request) || !(await hasValidAdminSession(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  if (!env.MEDIA_BUCKET) return jsonResponse({ error: "Profile image storage is not configured." }, 503);
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonResponse({ error: "Choose a profile image." }, 400);
    const image = await validateProfileWebp(file);
    const key = datedProfileKey("student-profiles");
    await env.MEDIA_BUCKET.put(key, image.bytes, {
      httpMetadata: { contentType: "image/webp", cacheControl: "private, max-age=3600" },
      customMetadata: { uploadedAt: new Date().toISOString(), purpose: "student-profile", width: String(image.width), height: String(image.height) },
    });
    return jsonResponse({ url: `/uploads/${key}`, width: image.width, height: image.height }, 201, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The image could not be uploaded." }, 400);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request) || !(await hasValidAdminSession(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  if (!env.MEDIA_BUCKET) return jsonResponse({ error: "Profile image storage is not configured." }, 503);
  try {
    const body = await request.json<{ url?: unknown }>();
    const key = uploadedProfileKey(body.url);
    if (!key) return jsonResponse({ error: "The profile image location is invalid." }, 400);
    await env.MEDIA_BUCKET.delete(key);
    return jsonResponse({ ok: true }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The image could not be removed." }, 400);
  }
};
