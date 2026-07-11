import { hasValidAdminSession, isSameOriginRequest, jsonResponse } from "../../../_lib/auth";
import type { R2Bucket } from "../../../_lib/storage";

type Env = { SESSION_SECRET?: string; MEDIA_BUCKET?: R2Bucket };
const MAX_SIZE = 3 * 1024 * 1024;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request) || !(await hasValidAdminSession(request, env))) return jsonResponse({ error: "Unauthorized" }, 401);
  if (!env.MEDIA_BUCKET) return jsonResponse({ error: "Profile image storage is not configured." }, 503);
  const form = await request.formData(); const file = form.get("file");
  if (!(file instanceof File) || file.type !== "image/webp" || !file.name.toLowerCase().endsWith(".webp") || file.size > MAX_SIZE) return jsonResponse({ error: "Choose a WebP profile image smaller than 3 MB." }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 12 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP") return jsonResponse({ error: "The uploaded file is not a valid WebP image." }, 400);
  const now = new Date(); const key = `student-profiles/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.webp`;
  await env.MEDIA_BUCKET.put(key, bytes, { httpMetadata: { contentType: "image/webp", cacheControl: "private, max-age=3600" }, customMetadata: { uploadedAt: now.toISOString(), purpose: "student-profile" } });
  return jsonResponse({ url: `/uploads/${key}` }, 201, { "Cache-Control": "no-store" });
};
