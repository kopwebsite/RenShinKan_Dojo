import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  migrateLegacyGalleries,
  syncLegacyGalleryArrays,
  type GalleryAlbums,
} from "../shared/gallery";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("backward-compatible gallery album migration", () => {
  it("preserves legacy ids, urls, order, visibility, and avoids invented dates", () => {
    const legacy = {
      onTheMatMedia: [
        { id: "one", src: "/one.jpg", alt: "One", type: "image" },
        { id: "two", src: "/two.jpg", alt: "Two", type: "image" },
      ],
      historyMedia: [{ id: "history", src: "/history.jpg", alt: "History", type: "image" }],
      passedTestStudents: [{ id: "exam", image: "/exam.jpg", alt: "Exam", dateAdded: "2026-01-02" }],
    };
    const albums = migrateLegacyGalleries(legacy);
    expect(albums["on-the-mat"]).toHaveLength(1);
    expect(albums["on-the-mat"][0].title).toBe("General Gallery");
    expect(albums["on-the-mat"][0].photos.map((photo) => [photo.id, photo.src])).toEqual([
      ["one", "/one.jpg"],
      ["two", "/two.jpg"],
    ]);
    expect(albums.history[0].title).toBe("Photo Archive");
    expect(albums.achievements[0].title).toBe("Photo Archive");
    expect(albums.achievements[0].date).toBeUndefined();
    expect(albums.achievements[0].photos[0].visibility).toBe("published");
  });

  it("is idempotent and respects deliberately empty album collections", () => {
    const first = migrateLegacyGalleries({
      onTheMatMedia: [{ id: "one", src: "/one.jpg", type: "image" }],
    });
    const second = migrateLegacyGalleries({ galleryAlbums: first });
    expect(second).toEqual(first);
    expect(migrateLegacyGalleries({
      galleryAlbums: { ...first, history: [] },
      historyMedia: [{ id: "legacy", src: "/legacy.jpg", type: "image" }],
    }).history).toEqual([]);
  });

  it("keeps hidden, draft, and trashed photos out of legacy public arrays", () => {
    const albums: GalleryAlbums = {
      "on-the-mat": [{
        id: "album-mat",
        galleryId: "on-the-mat",
        title: "Practice",
        visibility: "published",
        order: 0,
        photos: [
          { id: "visible", src: "/visible.jpg", alt: "", visibility: "published" },
          { id: "hidden", src: "/hidden.jpg", alt: "", visibility: "hidden" },
          { id: "trash", src: "/trash.jpg", alt: "", visibility: "published", trashedAt: "2026-01-01T00:00:00Z" },
        ],
      }],
      history: [{
        id: "draft-history",
        galleryId: "history",
        title: "Draft",
        visibility: "draft",
        order: 0,
        photos: [{ id: "draft-photo", src: "/draft.jpg", alt: "", visibility: "published" }],
      }],
      achievements: [],
    };
    const synced = syncLegacyGalleryArrays({ galleryAlbums: albums });
    expect(synced.onTheMatMedia.map((photo) => photo.src)).toEqual(["/visible.jpg"]);
    expect(synced.historyMedia).toEqual([]);
  });

  it("normalizes albums containing more than 100 photos without truncating them", () => {
    const source = Array.from({ length: 120 }, (_, index) => ({
      id: `photo-${index}`,
      src: `/photo-${index}.jpg`,
      type: "image",
    }));
    const albums = migrateLegacyGalleries({ passedTestStudents: source.map((photo) => ({ ...photo, image: photo.src })) });
    expect(albums.achievements[0].photos).toHaveLength(120);
  });
});

describe("gallery security, recovery, performance, and interaction contracts", () => {
  it("keeps all mutations authenticated, same-origin, audited, and non-destructive in storage", () => {
    const galleries = file("functions/api/admin/galleries.ts");
    const media = file("functions/api/admin/gallery-media.ts");
    for (const source of [galleries, media]) {
      expect(source).toContain("getAuthorizedAdminSession");
      expect(source).toContain("requiresCentralAdmin");
      expect(source).toContain("isSameOriginRequest");
      expect(source).toContain("auditStatement");
    }
    expect(galleries).not.toContain("MEDIA_BUCKET.delete");
    expect(media).not.toContain("MEDIA_BUCKET.delete");
    const migration = file("migrations/0018_gallery_drafts.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS gallery_drafts");
    expect(migration).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
  });

  it("provides album ordering, bulk actions, trash, undo, focal points, incremental loading, retry, and exact preview", () => {
    const admin = file("src/pages/AdminGalleryPage.tsx");
    for (const value of [
      "Drag to reorder",
      "Select all",
      "Deselect all",
      "Move to trash",
      "Permanently remove",
      "Undo",
      "Focal point",
      "Load {Math.min(",
      "Retry",
      "Upload anyway",
      "Exact public presentation",
      "Review &amp; publish",
      "Save draft",
    ])
      expect(admin).toContain(value);
    expect(admin).toContain("const PAGE_SIZE = 48");
    expect(admin).toContain("Promise.all(");
    expect(admin).toContain("Math.min(3, jobs.length)");
    expect(admin).toContain("() => worker()");
  });

  it("shares keyboard, swipe, focus, scroll-lock, thumbnail, and reduced-motion behavior", () => {
    const lightbox = file("src/components/GalleryLightbox.tsx");
    for (const value of ["ArrowLeft", "ArrowRight", "Escape", "touchStart", "document.body.style.overflow", "restoreFocusRef", "FOCUSABLE", "thumbnailIndexes"]) {
      expect(lightbox).toContain(value);
    }
    expect(file("src/index.css")).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps translation keys in parity across every supported locale", () => {
    const dictionaries = ["en", "th", "ja", "zh-CN"].map((locale) =>
      JSON.parse(file(`src/i18n/${locale}.json`)) as { photoGalleries: Record<string, string> });
    const keys = Object.keys(dictionaries[0].photoGalleries).sort();
    for (const dictionary of dictionaries) {
      expect(Object.keys(dictionary.photoGalleries).sort()).toEqual(keys);
      expect(Object.values(dictionary.photoGalleries).every((value) => value.trim())).toBe(true);
    }
  });
});
