import { jsonResponse } from "../_lib/auth";
import { readEditableContentFromStorage, type StorageEnv } from "../_lib/storage";
import { GALLERY_IDS, type GalleryId } from "../../shared/gallery";

export const onRequestGet: PagesFunction<StorageEnv> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const requested = url.searchParams.get("galleryId");
    if (!GALLERY_IDS.includes(requested as GalleryId)) {
      return jsonResponse({ error: "Choose a valid gallery." }, 400, { "Cache-Control": "no-store" });
    }
    const galleryId = requested as GalleryId;
    const pageSize = 4;
    const requestedPage = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const content = await readEditableContentFromStorage(env);
    const albums = content.galleryAlbums[galleryId]
      .filter((album) => album.visibility === "published")
      .sort((left, right) => left.order - right.order);
    const totalPages = Math.max(1, Math.ceil(albums.length / pageSize));
    const page = Math.min(requestedPage, totalPages);
    return jsonResponse({
      albums: albums.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, pageSize, total: albums.length, totalPages },
    }, 200, { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" });
  } catch {
    return jsonResponse({ error: "The gallery is temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
};
