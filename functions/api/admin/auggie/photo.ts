import {
  getAuthorizedAdminSession,
  isSameOriginRequest,
  jsonResponse,
  requiresCentralAdmin,
} from "../../../_lib/auth";
import { uploadsEnabled } from "../../../_lib/operationalControls";
import {
  getUploadFiles,
  StorageOperationError,
  uploadFilesToR2,
  type StorageEnv,
} from "../../../_lib/storage";
import {
  adminAuditMetadata,
  auditStatement,
  requestIdentifier,
  requireStudentDb,
  type StudentEnv,
} from "../../../_lib/studentRecords";

type Env = StudentEnv &
  StorageEnv & {
    SESSION_SECRET?: string;
    UPLOADS_ENABLED?: string;
  };

// This upload is deliberately context-neutral. The stored media id is passed
// to the next chat request, where the bounded conversation and current message
// determine whether a confirmed newsletter or gallery proposal may use it.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request))
    return jsonResponse({ error: "Forbidden" }, 403);
  const session = await getAuthorizedAdminSession(request, env);
  if (!requiresCentralAdmin(session))
    return jsonResponse(
      {
        error:
          "Only the RenShinKan administrator may add photos in Admin Auggie.",
      },
      session ? 403 : 401,
    );
  if (!uploadsEnabled(env))
    return jsonResponse(
      {
        error:
          "Photo uploads are temporarily paused. Existing media is unchanged.",
      },
      503,
    );

  let uploadedKey = "";
  try {
    const files = getUploadFiles(await request.formData());
    if (files.length !== 1)
      return jsonResponse({ error: "Choose one photo to add." }, 400);
    if (files[0].type !== "image/webp")
      return jsonResponse({ error: "Photos must be prepared as WebP." }, 400);

    const result = await uploadFilesToR2(env, files);
    const uploaded = result.uploaded[0];
    if (!uploaded || uploaded.contentType !== "image/webp")
      return jsonResponse({ error: "The photo was not stored." }, 500);

    uploadedKey = uploaded.key;
    const db = requireStudentDb(env);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
      db
        .prepare(
          `INSERT INTO media_assets (
            id, storage_key, public_url, mime_type, byte_size, uploaded_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          uploaded.key,
          uploaded.url,
          uploaded.contentType,
          uploaded.size,
          session!.adminName,
          now,
        ),
      auditStatement(db, {
        actorType: "administrator",
        ...adminAuditMetadata(session!, request),
        action: "admin_ai_photo_uploaded",
        entityType: "media_asset",
        entityId: id,
        newValues: {
          url: uploaded.url,
          size: uploaded.size,
          sha256: uploaded.sha256,
        },
        source: "admin_auggie",
        requestId: requestIdentifier(request),
        summary: "Added a photo for an Admin Auggie conversation",
        createdAt: now,
      }),
    ]);
    uploadedKey = "";

    return jsonResponse(
      {
        ok: true,
        asset: {
          id,
          url: uploaded.url,
          contentType: uploaded.contentType,
          size: uploaded.size,
        },
      },
      201,
      { "Cache-Control": "private, no-store" },
    );
  } catch (error) {
    if (uploadedKey && env.MEDIA_BUCKET)
      await env.MEDIA_BUCKET.delete(uploadedKey).catch(() => undefined);
    const unavailable = error instanceof StorageOperationError;
    return jsonResponse(
      {
        error: unavailable
          ? error.message
          : error instanceof Error
            ? error.message
            : "The photo could not be uploaded.",
      },
      unavailable ? 503 : 400,
      { "Cache-Control": "private, no-store" },
    );
  }
};
