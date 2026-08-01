import { jsonResponse } from "../_lib/auth";
import { type StorageEnv, readEditableContentFromStorage } from "../_lib/storage";
import { requestIdentifier, type D1Database } from "../_lib/studentRecords";
import { formatGregorianDateTime } from "../../shared/date";

type Env = StorageEnv & { STUDENT_DB?: D1Database };

function publicProjection(content: Awaited<ReturnType<typeof readEditableContentFromStorage>>) {
  const recentEvents = [...content.recentEvents]
    .filter((event) => event.published && event.lifecycleStatus !== "archived" && event.lifecycleStatus !== "trash" && !event.trashedAt)
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
    .slice(0, 3)
    .map((event) => ({ ...event, body: "", bodyContent: undefined, media: (event.media || []).slice(0, 1) }));
  const galleryAlbums = Object.fromEntries(Object.entries(content.galleryAlbums).map(([galleryId, albums]) => [
    galleryId,
    albums.slice(0, 4).map((album) => ({ ...album, photos: album.photos.filter((photo) => !photo.trashedAt).slice(0, 12) })),
  ])) as typeof content.galleryAlbums;
  return { ...content, recentEvents, galleryAlbums };
}

function activeExamAnnouncement(value: string, venue: string) {
  const formatted = formatGregorianDateTime(value, value);
  return `Next belt examination: ${formatted}${venue ? ` at ${venue}` : ""}`;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdentifier(request);
  if (!env.CONTENT_KV) {
    return jsonResponse(
      { ok: false, error: "Cloudflare CONTENT_KV binding is not configured" },
      503,
      { "Cache-Control": "no-store" },
    );
  }

  try {
    let content = await readEditableContentFromStorage(env);
    if (env.STUDENT_DB) {
      const cycle = await env.STUDENT_DB.prepare(`SELECT examination_at, venue, updated_at
        FROM examination_cycles
        WHERE status = 'active' AND examination_at IS NOT NULL AND examination_at <> ''
        ORDER BY created_at DESC LIMIT 1`)
        .first<{ examination_at: string; venue: string; updated_at: string | null }>();
      if (cycle) {
        content = {
          ...content,
          examAnnouncement: {
            text: activeExamAnnouncement(cycle.examination_at, cycle.venue),
            updatedAt: cycle.updated_at || cycle.examination_at,
          },
        };
      }
    }
    return jsonResponse(publicProjection(content), 200, {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      Vary: "Accept-Encoding",
    });
  } catch (error) {
    console.error("Public content read failed", {
      requestId,
      category: error instanceof SyntaxError ? "malformed_content" : "storage_unavailable",
    });
    return jsonResponse(
      { ok: false, error: "Public content is temporarily unavailable. Please retry.", requestId },
      503,
      { "Cache-Control": "no-store" },
    );
  }
};
