import { ExternalLink, Images, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  GALLERY_IDS,
  galleryCover,
  galleryPhotoCount,
  type GalleryAlbums,
  type GalleryId,
} from "../../../shared/gallery";
import { adminApi, formatAdminDate } from "./adminApi";

const DEFINITIONS: Record<GalleryId, { name: string; page: string; route: string; presentation: string }> = {
  "on-the-mat": { name: "On the Mat", page: "Dojo page", route: "/#dojo-photos", presentation: "Editorial collage" },
  history: { name: "A Look at Our History", page: "Community page", route: "/community#past-events", presentation: "Historical timeline" },
  achievements: { name: "Students Who've Passed the Test", page: "Classes page", route: "/classes#gallery", presentation: "Achievement albums" },
};

type Response = {
  albums: GalleryAlbums;
  publishedAlbums: GalleryAlbums;
  lastPublishedAt: string | null;
  draftMeta: { updatedAt: string; updatedBy: string } | null;
};

export function AdminGalleryDashboard({ fallback }: { fallback: GalleryAlbums }) {
  const [data, setData] = useState<Response | null>(null);
  useEffect(() => {
    let ignore = false;
    adminApi<Response>("/api/admin/galleries")
      .then((response) => { if (!ignore) setData(response); })
      .catch(() => undefined);
    return () => { ignore = true; };
  }, []);
  const albums = data?.albums || fallback;
  const publishedAlbums = data?.publishedAlbums || fallback;
  const updatedAt = data?.draftMeta?.updatedAt || data?.lastPublishedAt;

  return (
    <section id="photo-library" className="admin-gallery-dashboard scroll-mt-24" aria-labelledby="gallery-dashboard-title">
      <header>
        <div>
          <p className="eyebrow">Photo library</p>
          <h2 id="gallery-dashboard-title">Public galleries</h2>
          <p>Organize photographs into albums, then preview and publish each gallery.</p>
        </div>
      </header>
      <div className="admin-gallery-dashboard__grid">
        {GALLERY_IDS.map((galleryId) => {
          const definition = DEFINITIONS[galleryId];
          const entries = albums[galleryId];
          const previews = entries.flatMap((album) => {
            const cover = galleryCover(album);
            const photos = album.photos.filter((photo) => !photo.trashedAt);
            return cover ? [cover, ...photos.filter((photo) => photo.id !== cover.id)] : photos;
          }).slice(0, 3);
          const changed = JSON.stringify(entries) !== JSON.stringify(publishedAlbums[galleryId]);
          return (
            <article key={galleryId} className="admin-gallery-card">
              <div className="admin-gallery-card__preview" aria-hidden="true">
                {previews.map((photo) => (
                  <img key={photo.id} src={photo.thumbnailSrc || photo.src} alt="" loading="lazy" style={{ objectPosition: photo.objectPosition }} />
                ))}
                {previews.length === 0 ? <span><Images size={28} /> No photos</span> : null}
              </div>
              <div className="admin-gallery-card__body">
                <div className="admin-gallery-card__status">
                  <span className={changed ? "is-draft" : "is-published"}>{changed ? "Draft changes" : "Published"}</span>
                  <small>{definition.presentation}</small>
                </div>
                <h3>{definition.name}</h3>
                <p>{definition.page}</p>
                <dl>
                  <div><dt>Albums</dt><dd>{entries.length}</dd></div>
                  <div><dt>Photos</dt><dd>{galleryPhotoCount(entries)}</dd></div>
                  <div><dt>Updated</dt><dd>{updatedAt ? formatAdminDate(updatedAt) : "Not available"}</dd></div>
                </dl>
                <div className="admin-gallery-card__actions">
                  <Link className="btn-primary" to={`/admin/galleries/${galleryId}`}><Settings2 size={16} /> Manage gallery</Link>
                  <a className="btn-secondary" href={definition.route} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Preview</a>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
