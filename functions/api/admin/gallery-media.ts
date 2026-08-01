import { getAuthorizedAdminSession, isSameOriginRequest, jsonResponse, requiresCentralAdmin } from "../../_lib/auth";
import { getUploadFiles, StorageOperationError, uploadFilesToR2, type StorageEnv } from "../../_lib/storage";
import {
  adminAuditMetadata,
  auditStatement,
  requestIdentifier,
  requireStudentDb,
  type StudentEnv,
} from "../../_lib/studentRecords";
import { uploadsEnabled } from "../../_lib/operationalControls";

type Env = StudentEnv & StorageEnv & { SESSION_SECRET?: string; UPLOADS_ENABLED?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!requiresCentralAdmin(session)) {
    return jsonResponse({ error: "Only the RenShinKan administrator may upload gallery media." }, session ? 403 : 401);
  }
  if (!uploadsEnabled(env)) return jsonResponse({ error: "Gallery uploads are temporarily paused. Existing galleries are unchanged." }, 503);

  try {
    const files = getUploadFiles(await request.formData());
    if (files.length !== 1) return jsonResponse({ error: "Upload one gallery image at a time." }, 400);
    if (files[0].type !== "image/webp") {
      return jsonResponse({ error: "Gallery images must be prepared as WebP." }, 400);
    }

    const result = await uploadFilesToR2(env, files);
    const uploaded = result.uploaded[0];
    if (!uploaded) return jsonResponse({ error: "The image was not stored." }, 500);

    const db = requireStudentDb(env);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO media_assets (id, storage_key, public_url, mime_type, byte_size, uploaded_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, uploaded.key, uploaded.url, uploaded.contentType, uploaded.size, session!.adminName, now),
      auditStatement(db, {
        actorType: "administrator",
        ...adminAuditMetadata(session!, request),
        action: "gallery_media_uploaded",
        entityType: "media_asset",
        entityId: id,
        newValues: { url: uploaded.url, size: uploaded.size, sha256: uploaded.sha256 },
        source: "admin_gallery_manager",
        requestId: requestIdentifier(request),
        summary: "Uploaded gallery image",
        createdAt: now,
      }),
    ]);

    return jsonResponse({
      ok: true,
      asset: {
        id,
        url: uploaded.url,
        contentType: uploaded.contentType,
        size: uploaded.size,
        sha256: uploaded.sha256,
      },
    }, 201, { "Cache-Control": "no-store" });
  } catch (error) {
    const unavailable = error instanceof StorageOperationError;
    return jsonResponse({ error: unavailable ? error.message : error instanceof Error ? error.message : "The gallery image could not be uploaded." }, unavailable ? 503 : 400);
  }
};
