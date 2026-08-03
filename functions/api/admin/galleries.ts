import { getAuthorizedAdminSession, isSameOriginRequest, jsonResponse, requiresCentralAdmin } from "../../_lib/auth";
import {
  type EditableContent,
  validateGalleryAlbums,
} from "../../_lib/content";
import {
  readEditableContentFromStorage,
  type StorageEnv,
} from "../../_lib/storage";
import { publishEditableContent } from "../../_lib/publishing";
import { GALLERY_IDS, syncLegacyGalleryArrays, type GalleryAlbums, type GalleryId } from "../../../shared/gallery";
import {
  adminAuditMetadata,
  auditStatement,
  requestIdentifier,
  requireStudentDb,
  type StudentEnv,
} from "../../_lib/studentRecords";

type Env = StudentEnv & StorageEnv & { SESSION_SECRET?: string };
type DraftRow = { albums_json: string; updated_by: string; updated_at: string };

function scopedAlbums(albums: GalleryAlbums, galleryId: GalleryId): GalleryAlbums {
  return {
    "on-the-mat": galleryId === "on-the-mat" ? albums[galleryId] : [],
    history: galleryId === "history" ? albums[galleryId] : [],
    achievements: galleryId === "achievements" ? albums[galleryId] : [],
  };
}

async function publicContent(env: Env) {
  return readEditableContentFromStorage(env);
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
  const url = new URL(request.url);
  if (url.searchParams.get("summary") === "1") {
    const summaries = Object.fromEntries(GALLERY_IDS.map((galleryId) => {
      const entries = draftAlbums[galleryId];
      const previews = entries.flatMap((album) => album.photos.filter((photo) => !photo.trashedAt)).slice(0, 3);
      return [galleryId, {
        albumCount: entries.length,
        photoCount: entries.reduce((sum, album) => sum + album.photos.filter((photo) => !photo.trashedAt).length, 0),
        previews,
        changed: JSON.stringify(entries) !== JSON.stringify(content.galleryAlbums[galleryId]),
      }];
    }));
    return jsonResponse({ summaries, lastPublishedAt: content.lastPublishedAt, draftMeta: draft ? { updatedBy: draft.updated_by, updatedAt: draft.updated_at } : null }, 200, { "Cache-Control": "no-store" });
  }
  const requestedGalleryId = url.searchParams.get("galleryId");
  const galleryId = GALLERY_IDS.includes(requestedGalleryId as GalleryId) ? requestedGalleryId as GalleryId : null;

  return jsonResponse({
    albums: galleryId ? scopedAlbums(draftAlbums, galleryId) : draftAlbums,
    publishedAlbums: galleryId ? scopedAlbums(content.galleryAlbums, galleryId) : content.galleryAlbums,
    lastPublishedAt: content.lastPublishedAt,
    draftMeta: draft ? { updatedBy: draft.updated_by, updatedAt: draft.updated_at } : null,
  }, 200, { "Cache-Control": "no-store" });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const { session, allowed } = await authorized(request, env);
  if (!allowed) return jsonResponse({ error: "Only the RenShinKan administrator may manage galleries." }, session ? 403 : 401);

  try {
    const body = await request.json<{ albums?: unknown; galleryId?: unknown; expectedUpdatedAt?: unknown }>();
    const content = await publicContent(env);
    const db = requireStudentDb(env);
    const existing = await db.prepare("SELECT albums_json, updated_at FROM gallery_drafts WHERE id = 'current'")
      .first<{ albums_json: string; updated_at: string }>();
    const expected = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null;
    if (existing && expected !== existing.updated_at) {
      return jsonResponse({ error: "This gallery draft changed in another session. Reload before saving." }, 409);
    }
    if (!existing && expected) {
      return jsonResponse({ error: "This gallery draft no longer matches the saved version. Reload before saving." }, 409);
    }

    const requestedGalleryId = typeof body.galleryId === "string" ? body.galleryId : "";
    const galleryId = GALLERY_IDS.includes(requestedGalleryId as GalleryId) ? requestedGalleryId as GalleryId : null;
    const submitted = validateAlbums(body.albums, content);
    const currentDraft = existing ? validateAlbums(JSON.parse(existing.albums_json), content) : content.galleryAlbums;
    const albums = galleryId ? { ...currentDraft, [galleryId]: submitted[galleryId] } : submitted;

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

    return jsonResponse({ ok: true, albums: galleryId ? scopedAlbums(albums, galleryId) : albums, updatedAt: now }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The gallery draft could not be saved." }, 400);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  const { session, allowed } = await authorized(request, env);
  if (!allowed) return jsonResponse({ error: "Only the RenShinKan administrator may publish galleries." }, session ? 403 : 401);

  try {
    const body = await request.json<{ action?: unknown; confirmed?: unknown; expectedUpdatedAt?: unknown; galleryId?: unknown }>();
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

    const published = await publishEditableContent({
      env, db, request, session: session!, content: next,
      action: "galleries_published", source: "admin_gallery_manager",
      note: "Published gallery albums",
    });

    const requestedGalleryId = typeof body.galleryId === "string" ? body.galleryId : "";
    const galleryId = GALLERY_IDS.includes(requestedGalleryId as GalleryId) ? requestedGalleryId as GalleryId : null;
    return jsonResponse({
      ok: true,
      albums: galleryId ? scopedAlbums(galleryAlbums as GalleryAlbums, galleryId) : galleryAlbums as GalleryAlbums,
      publishedAt: now,
      updatedAt: draft.updated_at,
      publishOperation: published,
    }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The galleries could not be published." }, 400);
  }
};
