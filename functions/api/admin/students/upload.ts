import { hasValidAdminSession, isSameOriginRequest, jsonResponse } from "../../../_lib/auth";
import { datedProfileKey, validateProfileWebp, type R2Bucket } from "../../../_lib/storage";

type Env = { SESSION_SECRET?: string; MEDIA_BUCKET?: R2Bucket };
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
