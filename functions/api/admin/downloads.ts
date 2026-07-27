import { getAuthorizedAdminSession, isRenShinKanSuperAdmin, isSameOriginRequest, jsonResponse } from "../../_lib/auth";
import { uploadFilesToR2, type R2Bucket } from "../../_lib/storage";
import {
  adminAuditMetadata,
  auditStatement,
  requestIdentifier,
  requireStudentDb,
  type StudentEnv,
} from "../../_lib/studentRecords";

type Env = StudentEnv & { MEDIA_BUCKET?: R2Bucket };
const MAX_PDF_BYTES = 20 * 1024 * 1024;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.normalize("NFKC").trim().slice(0, max) : "";
}

function slugFor(value: unknown) {
  return clean(value, 120).toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function authorized(request: Request, env: Env) {
  const session = await getAuthorizedAdminSession(request, env);
  return session && isRenShinKanSuperAdmin(session) ? session : null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await authorized(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  const rows = await requireStudentDb(env).prepare(`SELECT * FROM download_assets
    ORDER BY sort_order ASC, updated_at DESC, id ASC`).all();
  return jsonResponse({ downloads: rows.results || [] }, 200, { "Cache-Control": "no-store" });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await authorized(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) return jsonResponse({ error: "Choose a PDF file." }, 400);
    if (file.size > MAX_PDF_BYTES) return jsonResponse({ error: "PDF files must be 20 MB or smaller." }, 400);
    if (file.type !== "application/pdf" || !file.name.toLocaleLowerCase("en-US").endsWith(".pdf")) {
      return jsonResponse({ error: "Downloads must be PDF files." }, 400);
    }
    const titleEn = clean(form.get("titleEn"), 160);
    const titleTh = clean(form.get("titleTh"), 160);
    const slug = slugFor(form.get("slug") || titleEn);
    const descriptionEn = clean(form.get("descriptionEn"), 600);
    const descriptionTh = clean(form.get("descriptionTh"), 600);
    const categoryLabel = clean(form.get("categoryLabel"), 120);
    const rankLabel = clean(form.get("rankLabel"), 120);
    const pageCount = Math.max(1, Math.min(999, Number(form.get("pageCount")) || 1));
    if (!titleEn || !slug || !categoryLabel) return jsonResponse({ error: "Enter an English title, category, and valid slug." }, 400);
    const uploaded = await uploadFilesToR2(env, [file]);
    const object = uploaded.uploaded[0];
    if (!object) return jsonResponse({ error: "The PDF could not be stored." }, 500);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const db = requireStudentDb(env);
    await db.batch([
      db.prepare(`INSERT INTO download_assets (
        id, slug, title_en, title_th, description_en, description_th, language_label,
        file_kind, static_path, object_key, file_size, page_count, published, sort_order,
        updated_at, updated_by, category_label, rank_label
      ) VALUES (?, ?, ?, ?, ?, ?, 'English / ไทย', 'PDF', NULL, ?, ?, ?, 0, 100, ?, ?, ?, ?)`)
        .bind(id, slug, titleEn, titleTh, descriptionEn, descriptionTh, object.key, object.size, pageCount, now, session.adminName, categoryLabel, rankLabel),
      auditStatement(db, {
        actorType: "administrator", ...adminAuditMetadata(session, request),
        action: "download_uploaded", entityType: "download_asset", entityId: id,
        newValues: { slug, titleEn, titleTh, categoryLabel, rankLabel, objectKey: object.key, fileSize: object.size, pageCount, published: false },
        source: "admin_downloads", requestId: requestIdentifier(request),
        summary: `Uploaded download draft ${titleEn}`, createdAt: now,
      }),
    ]);
    return jsonResponse({ ok: true, id }, 201, { "Cache-Control": "no-store" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The PDF could not be uploaded.";
    return jsonResponse({ error: message.includes("UNIQUE") ? "That download slug is already in use." : message }, message.includes("UNIQUE") ? 409 : 400);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await authorized(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  try {
    const form = await request.formData();
    const id = clean(form.get("id"), 80);
    const file = form.get("file");
    if (!id || !(file instanceof File) || file.size <= 0) return jsonResponse({ error: "Choose the download and its replacement PDF." }, 400);
    if (file.size > MAX_PDF_BYTES) return jsonResponse({ error: "PDF files must be 20 MB or smaller." }, 400);
    if (file.type !== "application/pdf" || !file.name.toLocaleLowerCase("en-US").endsWith(".pdf")) {
      return jsonResponse({ error: "Downloads must be PDF files." }, 400);
    }
    const db = requireStudentDb(env);
    const existing = await db.prepare(`SELECT id, title_en, static_path, object_key, file_size, page_count
      FROM download_assets WHERE id = ? LIMIT 1`).bind(id)
      .first<{ id: string; title_en: string; static_path: string | null; object_key: string | null; file_size: number | null; page_count: number | null }>();
    if (!existing) return jsonResponse({ error: "Download not found." }, 404);
    const uploaded = await uploadFilesToR2(env, [file]);
    const object = uploaded.uploaded[0];
    if (!object) return jsonResponse({ error: "The replacement PDF could not be stored." }, 500);
    const pageCountInput = Number(form.get("pageCount"));
    const pageCount = Number.isInteger(pageCountInput) && pageCountInput > 0 && pageCountInput <= 999
      ? pageCountInput
      : existing.page_count;
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`UPDATE download_assets SET static_path = NULL, object_key = ?, file_size = ?,
        page_count = ?, updated_at = ?, updated_by = ? WHERE id = ?`)
        .bind(object.key, object.size, pageCount, now, session.adminName, id),
      auditStatement(db, {
        actorType: "administrator", ...adminAuditMetadata(session, request),
        action: "download_file_replaced", entityType: "download_asset", entityId: id,
        previousValues: { staticPath: existing.static_path, objectKey: existing.object_key, fileSize: existing.file_size, pageCount: existing.page_count },
        newValues: { objectKey: object.key, fileSize: object.size, pageCount },
        source: "admin_downloads", requestId: requestIdentifier(request),
        summary: `Replaced download file for ${existing.title_en}`, createdAt: now,
      }),
    ]);
    return jsonResponse({ ok: true }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The replacement PDF could not be uploaded." }, 400);
  }
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await authorized(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json<Record<string, unknown>>();
    const id = clean(body.id, 80);
    const titleEn = clean(body.titleEn, 160);
    const titleTh = clean(body.titleTh, 160);
    const descriptionEn = clean(body.descriptionEn, 600);
    const descriptionTh = clean(body.descriptionTh, 600);
    const categoryLabel = clean(body.categoryLabel, 120);
    const rankLabel = clean(body.rankLabel, 120);
    const published = body.published === true ? 1 : 0;
    const sortOrder = Math.max(0, Math.min(10_000, Number(body.sortOrder) || 0));
    if (!id || !titleEn || !categoryLabel) return jsonResponse({ error: "The download, English title, and category are required." }, 400);
    const now = new Date().toISOString();
    const db = requireStudentDb(env);
    const existing = await db.prepare("SELECT id, published FROM download_assets WHERE id = ? LIMIT 1").bind(id)
      .first<{ id: string; published: number }>();
    if (!existing) return jsonResponse({ error: "Download not found." }, 404);
    await db.batch([
      db.prepare(`UPDATE download_assets SET title_en = ?, title_th = ?, description_en = ?,
        description_th = ?, category_label = ?, rank_label = ?, published = ?, sort_order = ?,
        updated_at = ?, updated_by = ? WHERE id = ?`)
        .bind(titleEn, titleTh, descriptionEn, descriptionTh, categoryLabel, rankLabel, published, sortOrder, now, session.adminName, id),
      auditStatement(db, {
        actorType: "administrator", ...adminAuditMetadata(session, request),
        action: published ? "download_published" : "download_unpublished",
        entityType: "download_asset", entityId: id,
        previousValues: { published: Boolean(existing.published) },
        newValues: { titleEn, titleTh, categoryLabel, rankLabel, published: Boolean(published), sortOrder },
        source: "admin_downloads", requestId: requestIdentifier(request),
        summary: `${published ? "Published" : "Unpublished"} download ${titleEn}`, createdAt: now,
      }),
    ]);
    return jsonResponse({ ok: true }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The download could not be updated." }, 400);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const session = await authorized(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json<Record<string, unknown>>();
    const id = clean(body.id, 80);
    const mode = body.mode === "delete" ? "delete" : "archive";
    if (!id) return jsonResponse({ error: "Choose a download." }, 400);
    const db = requireStudentDb(env);
    const existing = await db.prepare(`SELECT id, slug, title_en, title_th, static_path, object_key,
      file_size, page_count, published, sort_order FROM download_assets WHERE id = ? LIMIT 1`).bind(id)
      .first<Record<string, unknown>>();
    if (!existing) return jsonResponse({ error: "Download not found." }, 404);
    const now = new Date().toISOString();
    const requestId = requestIdentifier(request);
    if (mode === "archive") {
      await db.batch([
        db.prepare(`UPDATE download_assets SET published = 0, updated_at = ?, updated_by = ? WHERE id = ?`)
          .bind(now, session.adminName, id),
        auditStatement(db, {
          actorType: "administrator", ...adminAuditMetadata(session, request),
          action: "download_archived", entityType: "download_asset", entityId: id,
          previousValues: existing, newValues: { ...existing, published: 0 },
          source: "admin_downloads", requestId,
          summary: `Archived download ${String(existing.title_en || existing.slug)}`, createdAt: now,
        }),
      ]);
      return jsonResponse({ ok: true, archived: true }, 200, { "Cache-Control": "no-store" });
    }
    await db.batch([
      db.prepare("DELETE FROM download_assets WHERE id = ?").bind(id),
      auditStatement(db, {
        actorType: "administrator", ...adminAuditMetadata(session, request),
        action: "download_metadata_deleted", entityType: "download_asset", entityId: id,
        previousValues: existing, newValues: null,
        source: "admin_downloads", requestId,
        summary: `Deleted download metadata for ${String(existing.title_en || existing.slug)}; stored file retained`,
        createdAt: now,
      }),
    ]);
    return jsonResponse({ ok: true, deleted: true, storedFileRetained: true }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The download could not be archived or deleted." }, 400);
  }
};
