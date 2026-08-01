import { ArrowRight, CalendarDays, Images } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  galleryCover,
  publishedAlbums,
  visibleAlbumPhotos,
  type GalleryAlbum,
  type GalleryId,
  type GalleryPhoto,
} from "../../shared/gallery";
import { useTranslation } from "../i18n";
import { ResponsiveImage } from "./ResponsiveImage";
import { GalleryLightbox, type LightboxItem } from "./GalleryLightbox";

function GalleryTileImage({
  photo,
  alt,
  eager = false,
}: {
  photo: GalleryPhoto;
  alt?: string;
  eager?: boolean;
}) {
  if (photo.thumbnailSrc && photo.thumbnailSrc !== photo.src) {
    return (
      <img
        src={photo.thumbnailSrc}
        alt={alt ?? photo.alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        width={photo.width || 800}
        height={photo.height || 600}
        style={{ objectPosition: photo.objectPosition || "50% 50%" }}
      />
    );
  }
  return (
    <ResponsiveImage
      src={photo.src}
      avif={photo.avif}
      webp={photo.webp}
      alt={alt ?? photo.alt}
      loading={eager ? "eager" : "lazy"}
      width={photo.width}
      height={photo.height}
      objectPosition={photo.objectPosition || "50% 50%"}
    />
  );
}

function itemsForAlbums(albums: GalleryAlbum[]): LightboxItem[] {
  return albums.flatMap((album) =>
    visibleAlbumPhotos(album).map((photo) => ({
      albumId: album.id,
      albumTitle: album.title,
      albumDate: album.date,
      photo,
    })));
}

function useGalleryLightbox(albums: GalleryAlbum[]) {
  const items = useMemo(() => itemsForAlbums(albums), [albums]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const openAlbum = (albumId: string, photoId?: string) => {
    const found = items.findIndex((item) =>
      item.albumId === albumId && (!photoId || item.photo.id === photoId));
    if (found >= 0) setActiveIndex(found);
  };
  return {
    items,
    openAlbum,
    lightbox: activeIndex == null ? null : (
      <GalleryLightbox items={items} initialIndex={activeIndex} onClose={() => setActiveIndex(null)} />
    ),
  };
}

function useIncrementalGallery(galleryId: GalleryId, initialAlbums: GalleryAlbum[], incremental: boolean) {
  const [albums, setAlbums] = useState(initialAlbums);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!incremental) { setAlbums(initialAlbums); return; }
    if (!initialAlbums.length) return;
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/galleries?galleryId=${encodeURIComponent(galleryId)}&page=1`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Gallery unavailable")))
      .then((body: { albums: GalleryAlbum[]; pagination: { page: number; totalPages: number } }) => {
        setAlbums(body.albums);
        setPage(body.pagination.page);
        setTotalPages(body.pagination.totalPages);
      })
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [galleryId, incremental, initialAlbums]);
  const loadMore = async () => {
    if (!incremental || loading || page >= totalPages) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/galleries?galleryId=${encodeURIComponent(galleryId)}&page=${page + 1}`);
      if (!response.ok) return;
      const body = await response.json() as { albums: GalleryAlbum[]; pagination: { page: number; totalPages: number } };
      setAlbums((current) => [...current, ...body.albums]);
      setPage(body.pagination.page);
      setTotalPages(body.pagination.totalPages);
    } finally { setLoading(false); }
  };
  return { albums: incremental ? albums : initialAlbums, hasMore: incremental && page < totalPages, loading, loadMore };
}

export function EditorialGallery({ albums, incremental = false }: { albums: GalleryAlbum[]; incremental?: boolean }) {
  const { t } = useTranslation();
  const source = useIncrementalGallery("on-the-mat", albums, incremental);
  const visibleAlbums = useMemo(() => publishedAlbums(source.albums), [source.albums]);
  const gallery = useGalleryLightbox(visibleAlbums);
  const collage = gallery.items.slice(0, 6);
  if (!collage.length) return null;

  return (
    <div className="editorial-gallery" aria-label={t("photoGalleries.onMatLabel")}>
      <div className="editorial-gallery__collage">
        {collage.map((item, index) => (
          <button
            type="button"
            key={`${item.albumId}-${item.photo.id}`}
            className={index === 0 ? "editorial-gallery__feature" : `editorial-gallery__support editorial-gallery__support--${index}`}
            onClick={() => gallery.openAlbum(item.albumId, item.photo.id)}
            aria-label={t("photoGalleries.openPhoto", { number: index + 1, album: item.albumTitle })}
          >
            <GalleryTileImage
              photo={item.photo}
              alt={item.photo.alt || t("photoGalleries.photoAlt", { number: index + 1, album: item.albumTitle })}
              eager={index === 0}
            />
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="editorial-gallery__all btn-secondary"
        onClick={() => gallery.openAlbum(gallery.items[0].albumId, gallery.items[0].photo.id)}
      >
        <Images size={17} aria-hidden="true" />
        {t("photoGalleries.viewAll", { count: gallery.items.length })}
        <ArrowRight size={16} aria-hidden="true" />
      </button>
      {source.hasMore ? <button type="button" className="editorial-gallery__all btn-secondary" disabled={source.loading} onClick={() => void source.loadMore()}>{source.loading ? "Loading…" : "Load more albums"}</button> : null}
      {gallery.lightbox}
    </div>
  );
}

function TimelineAlbumCard({
  album,
  open,
}: {
  album: GalleryAlbum;
  open: () => void;
}) {
  const { t } = useTranslation();
  const photos = visibleAlbumPhotos(album);
  const cover = galleryCover(album);
  if (!cover || !photos.length) return null;
  return (
    <article className="history-album">
      <button type="button" onClick={open} aria-label={t("photoGalleries.openAlbum", { album: album.title })}>
        <GalleryTileImage
          photo={cover}
          alt={cover.alt || t("photoGalleries.photoAlt", { number: 1, album: album.title })}
        />
      </button>
      <div>
        {album.date ? <time dateTime={album.date}><CalendarDays size={14} aria-hidden="true" /> {album.date}</time> : null}
        <h4>{album.title}</h4>
        {album.description ? <p>{album.description}</p> : null}
        <button type="button" className="text-link" onClick={open}>
          {t("photoGalleries.photoCount", { count: photos.length })} <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export function HistoricalTimelineGallery({ albums, incremental = false }: { albums: GalleryAlbum[]; incremental?: boolean }) {
  const { t } = useTranslation();
  const source = useIncrementalGallery("history", albums, incremental);
  const visibleAlbums = useMemo(() => publishedAlbums(source.albums).filter((album) => visibleAlbumPhotos(album).length), [source.albums]);
  const gallery = useGalleryLightbox(visibleAlbums);
  const dated = visibleAlbums.filter((album) => album.date).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const archive = visibleAlbums.filter((album) => !album.date);
  const years = [...new Set(dated.map((album) => album.date!.slice(0, 4)))];
  if (!visibleAlbums.length) return null;

  return (
    <div className="history-gallery">
      {years.map((year) => (
        <section key={year} className="history-gallery__year" aria-labelledby={`history-year-${year}`}>
          <h3 id={`history-year-${year}`}>{year}</h3>
          <div>
            {dated.filter((album) => album.date!.startsWith(year)).map((album) => (
              <TimelineAlbumCard key={album.id} album={album} open={() => gallery.openAlbum(album.id)} />
            ))}
          </div>
        </section>
      ))}
      {archive.length ? (
        <section className="history-gallery__archive" aria-labelledby="history-photo-archive">
          <header>
            <p className="eyebrow">{t("photoGalleries.undated")}</p>
            <h3 id="history-photo-archive">{t("photoGalleries.archive")}</h3>
          </header>
          <div>
            {archive.map((album) => (
              <TimelineAlbumCard key={album.id} album={album} open={() => gallery.openAlbum(album.id)} />
            ))}
          </div>
        </section>
      ) : null}
      {source.hasMore ? <button type="button" className="btn-secondary" disabled={source.loading} onClick={() => void source.loadMore()}>{source.loading ? "Loading…" : "Load more albums"}</button> : null}
      {gallery.lightbox}
    </div>
  );
}

function AchievementAlbumCard({
  album,
  featured = false,
  open,
}: {
  album: GalleryAlbum;
  featured?: boolean;
  open: () => void;
}) {
  const { t } = useTranslation();
  const cover = galleryCover(album);
  const photos = visibleAlbumPhotos(album);
  if (!cover || !photos.length) return null;
  return (
    <article className={featured ? "achievement-album achievement-album--featured" : "achievement-album"}>
      <button type="button" className="achievement-album__image" onClick={open} aria-label={t("photoGalleries.openAlbum", { album: album.title })}>
        <GalleryTileImage
          photo={cover}
          alt={cover.alt || t("photoGalleries.photoAlt", { number: 1, album: album.title })}
          eager={featured}
        />
      </button>
      <div>
        {featured ? <p className="eyebrow">{t("photoGalleries.latestAchievement")}</p> : null}
        {album.date ? <time dateTime={album.date}>{album.date}</time> : null}
        <h4>{album.title}</h4>
        {album.description ? <p>{album.description}</p> : null}
        <button type="button" className="text-link" onClick={open}>
          {t("photoGalleries.photoCount", { count: photos.length })} <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export function AchievementAlbumsGallery({ albums, incremental = false }: { albums: GalleryAlbum[]; incremental?: boolean }) {
  const { t } = useTranslation();
  const source = useIncrementalGallery("achievements", albums, incremental);
  const visibleAlbums = useMemo(() => publishedAlbums(source.albums).filter((album) => visibleAlbumPhotos(album).length), [source.albums]);
  const gallery = useGalleryLightbox(visibleAlbums);
  const dated = visibleAlbums.filter((album) => album.date).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const archive = visibleAlbums.filter((album) => !album.date);
  const latest = dated[0];
  const earlier = dated.slice(1);
  if (!visibleAlbums.length) return null;

  return (
    <div className="achievement-gallery">
      {latest ? <AchievementAlbumCard album={latest} featured open={() => gallery.openAlbum(latest.id)} /> : null}
      {earlier.length ? (
        <div className="achievement-gallery__grid">
          {earlier.map((album) => <AchievementAlbumCard key={album.id} album={album} open={() => gallery.openAlbum(album.id)} />)}
        </div>
      ) : null}
      {archive.length ? (
        <section className="achievement-gallery__archive">
          <header>
            <p className="eyebrow">{t("photoGalleries.undated")}</p>
            <h4>{t("photoGalleries.archive")}</h4>
          </header>
          <div className="achievement-gallery__grid">
            {archive.map((album) => <AchievementAlbumCard key={album.id} album={album} open={() => gallery.openAlbum(album.id)} />)}
          </div>
        </section>
      ) : null}
      {source.hasMore ? <button type="button" className="btn-secondary" disabled={source.loading} onClick={() => void source.loadMore()}>{source.loading ? "Loading…" : "Load more albums"}</button> : null}
      {gallery.lightbox}
    </div>
  );
}
