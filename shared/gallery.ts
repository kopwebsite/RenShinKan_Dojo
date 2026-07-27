export const GALLERY_IDS = ["on-the-mat", "history", "achievements"] as const;

export type GalleryId = typeof GALLERY_IDS[number];
export type GalleryVisibility = "published" | "draft" | "hidden";
export type GalleryPhotoVisibility = "published" | "hidden";

export type GalleryPhoto = {
  id: string;
  src: string;
  thumbnailSrc?: string;
  avif?: string;
  webp?: string;
  alt: string;
  caption?: string;
  objectPosition?: string;
  width?: number;
  height?: number;
  sha256?: string;
  visibility: GalleryPhotoVisibility;
  createdAt?: string;
  updatedAt?: string;
  trashedAt?: string;
};

export type GalleryAlbum = {
  id: string;
  galleryId: GalleryId;
  title: string;
  date?: string;
  description?: string;
  coverPhotoId?: string;
  visibility: GalleryVisibility;
  order: number;
  createdAt?: string;
  updatedAt?: string;
  photos: GalleryPhoto[];
};

export type GalleryAlbums = Record<GalleryId, GalleryAlbum[]>;

export type LegacyGalleryContent = {
  galleryAlbums?: unknown;
  onTheMatMedia?: unknown;
  historyMedia?: unknown;
  passedTestStudents?: unknown;
};

const LEGACY_ALBUMS: Record<GalleryId, { id: string; title: string }> = {
  "on-the-mat": { id: "album-on-the-mat-general", title: "General Gallery" },
  history: { id: "album-history-archive", title: "Photo Archive" },
  achievements: { id: "album-achievements-archive", title: "Photo Archive" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizePhoto(value: unknown, fallbackId: string): GalleryPhoto | null {
  if (!isRecord(value)) return null;
  const src = stringValue(value.src || value.image).trim();
  if (!src) return null;

  return {
    id: stringValue(value.id, fallbackId).trim() || fallbackId,
    src,
    thumbnailSrc: optionalString(value.thumbnailSrc),
    avif: optionalString(value.avif),
    webp: optionalString(value.webp),
    alt: stringValue(value.alt),
    caption: optionalString(value.caption),
    objectPosition: optionalString(value.objectPosition) || "50% 50%",
    width: optionalNumber(value.width),
    height: optionalNumber(value.height),
    sha256: optionalString(value.sha256),
    visibility: value.visibility === "hidden" ? "hidden" : "published",
    createdAt: optionalString(value.createdAt),
    updatedAt: optionalString(value.updatedAt),
    trashedAt: optionalString(value.trashedAt),
  };
}

function normalizeAlbum(value: unknown, galleryId: GalleryId, index: number): GalleryAlbum | null {
  if (!isRecord(value)) return null;
  const photos = Array.isArray(value.photos)
    ? value.photos
        .map((photo, photoIndex) => normalizePhoto(photo, `photo-${galleryId}-${index}-${photoIndex}`))
        .filter((photo): photo is GalleryPhoto => Boolean(photo))
    : [];
  const visibility: GalleryVisibility =
    value.visibility === "draft" || value.visibility === "hidden" ? value.visibility : "published";

  return {
    id: stringValue(value.id, `album-${galleryId}-${index}`).trim() || `album-${galleryId}-${index}`,
    galleryId,
    title: stringValue(value.title, "Untitled album").trim() || "Untitled album",
    date: optionalString(value.date),
    description: optionalString(value.description),
    coverPhotoId: optionalString(value.coverPhotoId),
    visibility,
    order: typeof value.order === "number" && Number.isFinite(value.order) ? Math.max(0, Math.round(value.order)) : index,
    createdAt: optionalString(value.createdAt),
    updatedAt: optionalString(value.updatedAt),
    photos,
  };
}

function legacyPhotos(value: unknown, galleryId: GalleryId) {
  if (!Array.isArray(value)) return [];
  return value
    .map((photo, index) => normalizePhoto(photo, `legacy-${galleryId}-${index + 1}`))
    .filter((photo): photo is GalleryPhoto => Boolean(photo));
}

function defaultAlbum(galleryId: GalleryId, photos: GalleryPhoto[]): GalleryAlbum[] {
  if (photos.length === 0) return [];
  const definition = LEGACY_ALBUMS[galleryId];
  return [{
    id: definition.id,
    galleryId,
    title: definition.title,
    visibility: "published",
    order: 0,
    photos,
  }];
}

/**
 * Idempotently adds the album layer around legacy gallery arrays. A present
 * gallery key is always respected, including an intentionally empty array.
 */
export function migrateLegacyGalleries(content: LegacyGalleryContent): GalleryAlbums {
  const rawAlbums = isRecord(content.galleryAlbums) ? content.galleryAlbums : {};
  const legacyByGallery: Record<GalleryId, unknown> = {
    "on-the-mat": content.onTheMatMedia,
    history: content.historyMedia,
    achievements: content.passedTestStudents,
  };

  return Object.fromEntries(GALLERY_IDS.map((galleryId) => {
    if (Object.prototype.hasOwnProperty.call(rawAlbums, galleryId) && Array.isArray(rawAlbums[galleryId])) {
      const albums = (rawAlbums[galleryId] as unknown[])
        .map((album, index) => normalizeAlbum(album, galleryId, index))
        .filter((album): album is GalleryAlbum => Boolean(album))
        .sort((a, b) => a.order - b.order)
        .map((album, index) => ({ ...album, order: index }));
      return [galleryId, albums];
    }

    return [galleryId, defaultAlbum(galleryId, legacyPhotos(legacyByGallery[galleryId], galleryId))];
  })) as GalleryAlbums;
}

export function visibleAlbumPhotos(album: GalleryAlbum) {
  return album.photos.filter((photo) => photo.visibility === "published" && !photo.trashedAt);
}

export function galleryPhotoCount(albums: GalleryAlbum[], includeTrash = false) {
  return albums.reduce(
    (count, album) => count + album.photos.filter((photo) => includeTrash || !photo.trashedAt).length,
    0,
  );
}

export function galleryCover(album: GalleryAlbum) {
  const photos = visibleAlbumPhotos(album);
  return photos.find((photo) => photo.id === album.coverPhotoId) || photos[0] || null;
}

export function publishedAlbums(albums: GalleryAlbum[]) {
  return albums
    .filter((album) => album.visibility === "published")
    .sort((a, b) => a.order - b.order);
}

export function syncLegacyGalleryArrays<T extends LegacyGalleryContent>(content: T): T & {
  galleryAlbums: GalleryAlbums;
  onTheMatMedia: Array<Record<string, unknown>>;
  historyMedia: Array<Record<string, unknown>>;
  passedTestStudents: Array<Record<string, unknown>>;
} {
  const galleryAlbums = migrateLegacyGalleries(content);
  const visiblePhotos = (galleryId: GalleryId) =>
    publishedAlbums(galleryAlbums[galleryId]).flatMap(visibleAlbumPhotos);
  const toMedia = (photo: GalleryPhoto) => ({
    id: photo.id,
    src: photo.src,
    ...(photo.avif ? { avif: photo.avif } : {}),
    ...(photo.webp ? { webp: photo.webp } : {}),
    alt: photo.alt,
    ...(photo.caption ? { caption: photo.caption } : {}),
    type: "image",
    ...(photo.objectPosition ? { objectPosition: photo.objectPosition } : {}),
    ...(photo.width ? { width: photo.width } : {}),
    ...(photo.height ? { height: photo.height } : {}),
  });

  return {
    ...content,
    galleryAlbums,
    onTheMatMedia: visiblePhotos("on-the-mat").map(toMedia),
    historyMedia: visiblePhotos("history").map(toMedia),
    passedTestStudents: visiblePhotos("achievements").map((photo) => ({
      id: photo.id,
      image: photo.src,
      alt: photo.alt,
      ...(photo.caption ? { caption: photo.caption } : {}),
      ...(photo.objectPosition ? { objectPosition: photo.objectPosition } : {}),
    })),
  };
}
