import type { GalleryAlbum, GalleryId, GalleryPhoto } from "../../shared/gallery";
import type { NewsletterLifecycleStatus } from "../../shared/newsletter";
import type { RecentEvent, SiteLocale, SitePage } from "./content";

// Pure shaping helpers for the Admin Auggie website tools. Nothing here reads a
// session, opens a database, or performs a write: every function turns a record
// the reviewed administration endpoint already returned into either a minimal
// preview row, a comparable state string, or the exact next record that the
// same reviewed endpoint will validate and save.

export type NewsletterLifecycle = NewsletterLifecycleStatus;

export type ContentRecord = {
  studentId: string;
  name: string;
  dojo: string;
  rank: string;
  status: string;
  before?: string;
  after?: string;
};

export type DojoRecord = {
  id: string;
  official_name: string;
  short_name: string;
  code: string;
  slug: string;
  logo_url: string;
  active: number;
  sort_order: number;
  updated_at?: string | null;
  contact?: Record<string, unknown>;
};

function text(value: unknown, max: number) {
  return typeof value === "string"
    ? value
        .normalize("NFKC")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, max)
    : "";
}

// --- Newsletters and events -------------------------------------------------

export function newsletterLifecycle(event: RecentEvent): NewsletterLifecycle {
  return event.lifecycleStatus ?? "active";
}

export function newsletterSendStatus(event: RecentEvent) {
  return event.newsletter?.status ?? "not_sent";
}

// Every field that any Admin Auggie newsletter tool can change, plus the saved
// timestamp the reviewed save endpoint uses for its own conflict check.
export function newsletterState(event: RecentEvent) {
  return [
    event.id,
    event.slug,
    event.published ? "published" : "unpublished",
    newsletterLifecycle(event),
    newsletterSendStatus(event),
    event.updatedAt,
  ].join("|");
}

export function newsletterStatusLabel(event: RecentEvent) {
  const lifecycle = newsletterLifecycle(event);
  if (lifecycle === "trash") return "in trash";
  if (lifecycle === "archived") return "archived";
  if (newsletterSendStatus(event) === "sent") return "sent to subscribers";
  return event.published ? "published on website" : "draft";
}

export function newsletterRecord(event: RecentEvent): ContentRecord {
  return {
    studentId: event.slug || "(no web address)",
    name: event.title || "Untitled draft",
    dojo: event.contentType === "event" ? "Event" : "Newsletter",
    rank: event.date || "",
    status: newsletterStatusLabel(event),
  };
}

export function newsletterWithWebsiteState(
  event: RecentEvent,
  published: boolean,
  now: string,
): RecentEvent {
  return {
    ...event,
    published,
    websitePublishRequested: published,
    publishedAt: published ? event.publishedAt || now : event.publishedAt,
    updatedAt: now,
  };
}

// Mirrors the reviewed newsletter library exactly: restoring clears the trash
// timestamp, archiving and trashing stamp their own, and no other field moves.
export function newsletterWithLifecycle(
  event: RecentEvent,
  lifecycle: NewsletterLifecycle,
  now: string,
): RecentEvent {
  return {
    ...event,
    lifecycleStatus: lifecycle,
    archivedAt: lifecycle === "archived" ? now : event.archivedAt ?? null,
    trashedAt:
      lifecycle === "trash"
        ? now
        : lifecycle === "active"
          ? null
          : event.trashedAt ?? null,
    updatedAt: now,
  };
}

// --- Galleries --------------------------------------------------------------

export function livePhotos(album: GalleryAlbum) {
  return album.photos.filter((photo) => !photo.trashedAt);
}

export function albumsState(albums: GalleryAlbum[]) {
  return JSON.stringify(
    albums.map((album) => [
      album.id,
      album.title,
      album.date || "",
      album.description || "",
      album.visibility,
      album.coverPhotoId || "",
      album.photos.map((photo) => [
        photo.id,
        photo.caption || "",
        photo.alt,
        photo.visibility,
        photo.trashedAt || "",
      ]),
    ]),
  );
}

export function albumRecord(
  album: GalleryAlbum,
  galleryId: GalleryId,
): ContentRecord {
  return {
    studentId: album.id,
    name: album.title,
    dojo: galleryId,
    rank: album.date || "",
    status: `${album.visibility} · ${livePhotos(album).length} photo(s)`,
  };
}

export function photoRecord(photo: GalleryPhoto): ContentRecord {
  return {
    studentId: photo.id,
    name: photo.caption || photo.alt || "(no caption)",
    dojo: "",
    rank: "",
    status: photo.trashedAt ? "in trash" : photo.visibility,
  };
}

export function albumWithDetails(
  album: GalleryAlbum,
  patch: {
    title?: string;
    description?: string;
    date?: string;
    visibility?: GalleryAlbum["visibility"];
    coverPhotoId?: string;
  },
  now: string,
): GalleryAlbum {
  return {
    ...album,
    title: patch.title === undefined ? album.title : text(patch.title, 160),
    description:
      patch.description === undefined
        ? album.description
        : text(patch.description, 2_000),
    date: patch.date === undefined ? album.date : patch.date,
    visibility: patch.visibility ?? album.visibility,
    coverPhotoId:
      patch.coverPhotoId === undefined ? album.coverPhotoId : patch.coverPhotoId,
    updatedAt: now,
  };
}

// Reorders by exact identifier. A list that is not a complete permutation of
// the current identifiers returns null so the caller refuses rather than
// silently dropping or duplicating a record.
export function reorderByIds<T>(
  items: T[],
  ids: string[],
  identify: (item: T) => string,
): T[] | null {
  if (ids.length !== items.length) return null;
  const unique = new Set(ids);
  if (unique.size !== ids.length) return null;
  const byId = new Map(items.map((item) => [identify(item), item]));
  if (byId.size !== items.length) return null;
  const ordered: T[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) return null;
    ordered.push(item);
  }
  return ordered;
}

export function albumsWithOrder(albums: GalleryAlbum[], albumIds: string[]) {
  const ordered = reorderByIds(albums, albumIds, (album) => album.id);
  return ordered
    ? ordered.map((album, index) => ({ ...album, order: index }))
    : null;
}

export function albumWithPhotoOrder(
  album: GalleryAlbum,
  photoIds: string[],
  now: string,
): GalleryAlbum | null {
  const ordered = reorderByIds(album.photos, photoIds, (photo) => photo.id);
  return ordered ? { ...album, photos: ordered, updatedAt: now } : null;
}

export function albumWithPhotoCaptions(
  album: GalleryAlbum,
  captions: Array<{ photoId: string; caption?: string; alt?: string }>,
  now: string,
): GalleryAlbum | null {
  const byId = new Map(captions.map((entry) => [entry.photoId, entry]));
  if (byId.size !== captions.length) return null;
  if (captions.some((entry) => !album.photos.some((photo) => photo.id === entry.photoId)))
    return null;
  return {
    ...album,
    photos: album.photos.map((photo) => {
      const entry = byId.get(photo.id);
      if (!entry) return photo;
      return {
        ...photo,
        caption:
          entry.caption === undefined ? photo.caption : text(entry.caption, 1_000),
        alt: entry.alt === undefined ? photo.alt : text(entry.alt, 300),
        updatedAt: now,
      };
    }),
    updatedAt: now,
  };
}

// --- Website pages ----------------------------------------------------------

export function sitePageState(page: SitePage) {
  return [page.id, page.route, page.status].join("|");
}

export function sitePagesState(pages: SitePage[]) {
  return JSON.stringify(pages.map(sitePageState));
}

export function sitePageRecord(page: SitePage): ContentRecord {
  return {
    studentId: page.route,
    name: page.translations?.en?.title || page.route,
    dojo: "Website page",
    rank: "",
    status: page.status,
  };
}

export function sitePagesWithStatus(
  pages: SitePage[],
  route: string,
  status: SitePage["status"],
) {
  return pages.map((page) =>
    page.route === route ? { ...page, status } : page,
  );
}

// The exact words a text edit targets, in one locale, rebuilt identically when
// the proposal is prepared and again when it is confirmed. Any change to the
// very same block paragraph or page title in between makes the two strings
// differ, so the confirmation is refused before anything is sent to the
// reviewed endpoint. A block edit reads the block's title and text; a
// page-level edit reads the page title and its two SEO fields.
export function sitePageTextState(
  page: SitePage,
  locale: SiteLocale,
  blockId: string,
) {
  if (blockId) {
    const block = page.blocks.find((entry) => entry.id === blockId);
    if (!block) return "missing-block";
    const translation = block.translations[locale];
    return `block|${translation?.title || ""}|${translation?.text || ""}`;
  }
  const translation = page.translations[locale];
  return `page|${translation?.title || ""}|${translation?.seoTitle || ""}|${
    translation?.seoDescription || ""
  }`;
}

// Applies a proposed text change to exactly one page. Only the fields the
// administrator is changing are set; every other field, block and locale is
// carried over untouched. A block edit (blockId given) changes that block's
// title and/or text in the chosen locale; a page-level edit changes the page
// title and/or its SEO fields. The reviewed endpoint still re-validates the
// whole site draft before saving it.
export function sitePageWithText(
  pages: SitePage[],
  route: string,
  patch: {
    locale: SiteLocale;
    blockId?: string;
    title?: string;
    text?: string;
    seoTitle?: string;
    seoDescription?: string;
  },
) {
  return pages.map((page) => {
    if (page.route !== route) return page;
    if (patch.blockId) {
      return {
        ...page,
        blocks: page.blocks.map((block) => {
          if (block.id !== patch.blockId) return block;
          return {
            ...block,
            translations: {
              ...block.translations,
              [patch.locale]: {
                ...block.translations[patch.locale],
                ...(patch.title !== undefined ? { title: patch.title } : {}),
                ...(patch.text !== undefined ? { text: patch.text } : {}),
              },
            },
          };
        }),
      };
    }
    return {
      ...page,
      translations: {
        ...page.translations,
        [patch.locale]: {
          ...page.translations[patch.locale],
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.seoTitle !== undefined ? { seoTitle: patch.seoTitle } : {}),
          ...(patch.seoDescription !== undefined
            ? { seoDescription: patch.seoDescription }
            : {}),
        },
      },
    };
  });
}

// --- Dojo settings ----------------------------------------------------------

export function dojoState(dojo: DojoRecord) {
  return [
    dojo.id,
    dojo.official_name,
    dojo.short_name,
    dojo.code,
    dojo.slug,
    String(Number(dojo.active) === 1 ? 1 : 0),
    String(Number(dojo.sort_order) || 0),
    dojo.updated_at || "",
  ].join("|");
}

export function dojoRecord(dojo: DojoRecord): ContentRecord {
  return {
    studentId: dojo.id,
    name: dojo.official_name,
    dojo: dojo.short_name,
    rank: dojo.code,
    status: `${Number(dojo.active) === 1 ? "active" : "inactive"} · order ${
      Number(dojo.sort_order) || 0
    }`,
  };
}

// The identity fields the model may never supply — code, web address, logo path
// and contact details — are always carried over from the record the reviewed
// endpoint returned, never from tool arguments.
export function dojoUpdateBody(
  dojo: DojoRecord,
  patch: {
    officialName?: string;
    shortName?: string;
    active?: boolean;
    sortOrder?: number;
  },
) {
  return {
    id: dojo.id,
    officialName:
      patch.officialName === undefined
        ? dojo.official_name
        : text(patch.officialName, 160),
    shortName:
      patch.shortName === undefined ? dojo.short_name : text(patch.shortName, 100),
    code: dojo.code,
    slug: dojo.slug,
    logoUrl: dojo.logo_url,
    active: patch.active === undefined ? Number(dojo.active) === 1 : patch.active,
    sortOrder:
      patch.sortOrder === undefined ? Number(dojo.sort_order) || 0 : patch.sortOrder,
    contact: dojo.contact && typeof dojo.contact === "object" ? dojo.contact : {},
  };
}
