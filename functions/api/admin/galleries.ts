import { getAuthorizedAdminSession, isSameOriginRequest, jsonResponse, requiresCentralAdmin } from "../../_lib/auth";
import {
  type EditableContent,
  validateGalleryAlbums,
} from "../../_lib/content";
import {
  emptyContent,
  readEditableContentFromStorage,
  writeEditableContentToStorage,
  type StorageEnv,
} from "../../_lib/storage";
import { syncLegacyGalleryArrays, type GalleryAlbums } from "../../../shared/gallery";
import {
  adminAuditMetadata,
  auditStatement,
  requestIdentifier,
  requireStudentDb,
  type StudentEnv,
} from "../../_lib/studentRecords";

type Env = StudentEnv & StorageEnv & { SESSION_SECRET?: string };
type DraftRow = { albums_json: string; updated_by: string; updated_at: string };

async function publicContent(env: Env) {
  try {
    return await readEditableContentFromStorage(env);
  } catch {
    return emptyContent();
  }
}

function validateAlbums(value: unknown, content: EditableContent) {
  return validateGalleryAlbums(value, {
    historyMedia: content.historyMedia,
    onTheMatMedia: content.onTheMatMedia,
    passedTestStudents: content.passedTestStudents,
  });
}

async function authorized(request: Request, env: Env) {
  const session = await getAuthorizedAdminSession(request, env);
  return { session, allowed: requiresCentralAdmin(session) };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const { session, allowed } = await authorized(request, env);
  if (!allowed) return jsonResponse({ error: "Only the RenShinKan administrator may manage galleries." }, session ? 403 : 401);

  const db = requireStudentDb(env);
  const [content, draft] = await Promise.all([
    publicContent(env),
    db.prepare("SELECT albums_json, updated_by, updated_at FROM gallery_drafts WHERE id = 'current'")
      .first<DraftRow>(),
  ]);
  const draftAlbums = draft ? validateAlbums(JSON.parse(draft.albums_json), content) : content.galleryAlbums;

  return jsonResponse({
    albums: draftAlbums,
    publishedAlbums: content.galleryAlbums,
    lastPublishedAt: content.lastPublishedAt,
    draftMeta: draft ? { updatedBy: draft.updated_by, updatedAt: draft.updated_at } : null,
  }, 200, { "Cache-Control": "no-store" });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const { session, allowed } = await authorized(request, env);
  if (!allowed) return jsonResponse({ error: "Only the RenShinKan administrator may manage galleries." }, session ? 403 : 401);

  try {
    const body = await request.json<{ albums?: unknown; expectedUpdatedAt?: unknown }>();
    const content = await publicContent(env);
    const albums = validateAlbums(body.albums, content);
    const db = requireStudentDb(env);
    const existing = await db.prepare("SELECT updated_at FROM gallery_drafts WHERE id = 'current'")
      .first<{ updated_at: string }>();
    const expected = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null;
    if (existing && expected !== existing.updated_at) {
      return jsonResponse({ error: "This gallery draft changed in another session. Reload before saving." }, 409);
    }
    if (!existing && expected) {
      return jsonResponse({ error: "This gallery draft no longer matches the saved version. Reload before saving." }, 409);
    }

    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO gallery_drafts (id, albums_json, updated_by, updated_at)
        VALUES ('current', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET albums_json = excluded.albums_json,
          updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
        .bind(JSON.stringify(albums), session!.adminName, now),
      auditStatement(db, {
        actorType: "administrator",
        ...adminAuditMetadata(session!, request),
        action: "gallery_draft_saved",
        entityType: "gallery_draft",
        entityId: "current",
        newValues: {
          albumCount: Object.values(albums).reduce((sum, entries) => sum + entries.length, 0),
        },
        source: "admin_gallery_manager",
        requestId: requestIdentifier(request),
        summary: "Saved gallery album draft",
        createdAt: now,
      }),
    ]);

    return jsonResponse({ ok: true, albums, updatedAt: now }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The gallery draft could not be saved." }, 400);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const { session, allowed } = await authorized(request, env);
  if (!allowed) return jsonResponse({ error: "Only the RenShinKan administrator may publish galleries." }, session ? 403 : 401);

  try {
    const body = await request.json<{ action?: unknown; confirmed?: unknown; expectedUpdatedAt?: unknown }>();
    if (body.action !== "publish" || body.confirmed !== true) {
      return jsonResponse({ error: "Confirm the gallery publish action." }, 400);
    }

    const db = requireStudentDb(env);
    const draft = await db.prepare("SELECT albums_json, updated_by, updated_at FROM gallery_drafts WHERE id = 'current'")
      .first<DraftRow>();
    if (!draft) return jsonResponse({ error: "Save the gallery draft before publishing." }, 409);
    if (body.expectedUpdatedAt !== draft.updated_at) {
      return jsonResponse({ error: "The saved gallery draft changed. Reload before publishing." }, 409);
    }

    const current = await publicContent(env);
    const galleryAlbums = validateAlbums(JSON.parse(draft.albums_json), current);
    const now = new Date().toISOString();
    const next = syncLegacyGalleryArrays({
      ...current,
      version: 2,
      galleryAlbums,
      lastPublishedAt: now,
    }) as EditableContent;

    await writeEditableContentToStorage(env, next);
    await db.batch([
      db.prepare("UPDATE gallery_drafts SET albums_json = ?, updated_by = ?, updated_at = ? WHERE id = 'current'")
        .bind(JSON.stringify(galleryAlbums), session!.adminName, now),
      auditStatement(db, {
        actorType: "administrator",
        ...adminAuditMetadata(session!, request),
        action: "galleries_published",
        entityType: "site_content",
        entityId: "gallery-albums",
        previousValues: { lastPublishedAt: current.lastPublishedAt },
        newValues: {
          lastPublishedAt: now,
          albumCount: Object.values(galleryAlbums).reduce((sum, entries) => sum + entries.length, 0),
        },
        source: "admin_gallery_manager",
        requestId: requestIdentifier(request),
        summary: "Published gallery albums",
        createdAt: now,
      }),
    ]);

    return jsonResponse({
      ok: true,
      albums: galleryAlbums as GalleryAlbums,
      publishedAt: now,
      updatedAt: now,
    }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The galleries could not be published." }, 400);
  }
};
