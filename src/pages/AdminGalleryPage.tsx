import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronLeft,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Images,
  LoaderCircle,
  RotateCcw,
  Save,
  Star,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { Link, Navigate, useParams } from "react-router";
import {
  GALLERY_IDS,
  galleryCover,
  galleryPhotoCount,
  type GalleryAlbum,
  type GalleryAlbums,
  type GalleryId,
  type GalleryPhoto,
} from "../../shared/gallery";
import { AdminDojoSelector, AdminLoginFields } from "../components/admin/AdminAccess";
import { adminApi, formatAdminDate } from "../components/admin/adminApi";
import { useAdminSession } from "../components/admin/useAdminSession";
import { GregorianDateInput } from "../components/GregorianDateInput";
import {
  AchievementAlbumsGallery,
  EditorialGallery,
  HistoricalTimelineGallery,
} from "../components/PublicGalleries";
import {
  prepareGalleryImage,
  uploadGalleryAsset,
  validateGallerySource,
} from "../lib/galleryUploads";

const PAGE_SIZE = 48;
const DIALOG_FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const EMPTY_ALBUMS: GalleryAlbums = { "on-the-mat": [], history: [], achievements: [] };
const GALLERY_INFO: Record<GalleryId, { name: string; page: string; presentation: string }> = {
  "on-the-mat": { name: "On the Mat", page: "Dojo page", presentation: "Editorial collage" },
  history: { name: "A Look at Our History", page: "Community page", presentation: "Historical timeline" },
  achievements: { name: "Students Who've Passed the Test", page: "Classes page", presentation: "Achievement albums" },
};

type GalleryResponse = {
  albums: GalleryAlbums;
  publishedAlbums: GalleryAlbums;
  lastPublishedAt: string | null;
  draftMeta: { updatedAt: string; updatedBy: string } | null;
};

type UploadStatus = "queued" | "preparing" | "uploading" | "success" | "failed" | "duplicate";
type UploadJob = {
  id: string;
  file: File;
  previewUrl: string;
  status: UploadStatus;
  progress: number;
  message?: string;
};

function newAlbum(galleryId: GalleryId, title = "Untitled album"): GalleryAlbum {
  const now = new Date().toISOString();
  return {
    id: `album-${crypto.randomUUID()}`,
    galleryId,
    title,
    visibility: "draft",
    order: 0,
    createdAt: now,
    updatedAt: now,
    photos: [],
  };
}

function photoPosition(value?: string) {
  const match = value?.match(/^(\d{1,3})% (\d{1,3})%$/);
  return {
    x: Math.min(100, Math.max(0, Number(match?.[1] || 50))),
    y: Math.min(100, Math.max(0, Number(match?.[2] || 50))),
  };
}

function move<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return items;
  next.splice(to, 0, item);
  return next;
}

export function AdminGalleryPage() {
  const params = useParams<{ galleryId: string }>();
  const galleryId = GALLERY_IDS.includes(params.galleryId as GalleryId) ? params.galleryId as GalleryId : null;
  const info = galleryId ? GALLERY_INFO[galleryId] : null;
  const session = useAdminSession();
  const [albums, setAlbums] = useState<GalleryAlbums>(EMPTY_ALBUMS);
  const [published, setPublished] = useState<GalleryAlbums>(EMPTY_ALBUMS);
  const [selectedAlbumId, setSelectedAlbumId] = useState("");
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [activePhotoId, setActivePhotoId] = useState("");
  const [draggedAlbumId, setDraggedAlbumId] = useState("");
  const [draggedPhotoId, setDraggedPhotoId] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const [message, setMessage] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [undoPhotoIds, setUndoPhotoIds] = useState<string[]>([]);
  const [moveTargetId, setMoveTargetId] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadAlbumId, setUploadAlbumId] = useState("");
  const [newUploadAlbumTitle, setNewUploadAlbumTitle] = useState("");
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadJobsRef = useRef<UploadJob[]>([]);
  const uploadDialogRef = useRef<HTMLElement>(null);
  const uploadCloseRef = useRef<HTMLButtonElement>(null);

  const currentAlbums = useMemo(() => galleryId ? albums[galleryId] : [], [albums, galleryId]);
  const selectedAlbum = currentAlbums.find((album) => album.id === selectedAlbumId) || null;
  const publishedGallery = useMemo(() => galleryId ? published[galleryId] : [], [galleryId, published]);
  const dirty = useMemo(() => JSON.stringify(albums) !== savedSnapshot, [albums, savedSnapshot]);
  const publicChanged = useMemo(
    () => JSON.stringify(currentAlbums) !== JSON.stringify(publishedGallery),
    [currentAlbums, publishedGallery],
  );
  const activePhotos = selectedAlbum?.photos.filter((photo) => !photo.trashedAt) || [];
  const trashPhotos = selectedAlbum?.photos.filter((photo) => Boolean(photo.trashedAt)) || [];
  const displayedPhotos = (showTrash ? trashPhotos : activePhotos).slice(0, visibleCount);
  const activePhoto = selectedAlbum?.photos.find((photo) => photo.id === activePhotoId) || null;
  const selectedSet = useMemo(() => new Set(selectedPhotoIds), [selectedPhotoIds]);
  const uploadProgress = uploadJobs.length
    ? Math.round(uploadJobs.reduce((sum, job) => sum + job.progress, 0) / uploadJobs.length)
    : 0;

  useEffect(() => {
    if (!galleryId || session.admin?.permissionLevel !== "renshinkan_super_admin") return;
    setSaveState("loading");
    adminApi<GalleryResponse>(`/api/admin/galleries?galleryId=${encodeURIComponent(galleryId)}`)
      .then((result) => {
        setAlbums(result.albums);
        setPublished(result.publishedAlbums);
        setSavedSnapshot(JSON.stringify(result.albums));
        setDraftUpdatedAt(result.draftMeta?.updatedAt || null);
        setLastPublishedAt(result.lastPublishedAt);
        const firstId = result.albums[galleryId][0]?.id || "";
        setSelectedAlbumId(firstId);
        setUploadAlbumId(firstId);
        setSaveState("idle");
      })
      .catch((error) => {
        setSaveState("error");
        setMessage(error instanceof Error ? error.message : "The gallery could not be loaded.");
      });
  }, [galleryId, session.admin?.permissionLevel]);

  useEffect(() => {
    setSelectedPhotoIds([]);
    setActivePhotoId("");
    setVisibleCount(PAGE_SIZE);
    setShowTrash(false);
  }, [selectedAlbumId]);

  useEffect(() => {
    uploadJobsRef.current = uploadJobs;
  }, [uploadJobs]);

  useEffect(() => () => {
    uploadJobsRef.current.forEach((job) => URL.revokeObjectURL(job.previewUrl));
  }, []);

  useEffect(() => {
    if (!uploadOpen) return;
    const restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    uploadCloseRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        uploadJobsRef.current.forEach((job) => URL.revokeObjectURL(job.previewUrl));
        setUploadJobs([]);
        setUploadOpen(false);
        return;
      }
      if (event.key !== "Tab" || !uploadDialogRef.current) return;
      const focusable = [...uploadDialogRef.current.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE)]
        .filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocus?.focus();
    };
  }, [uploadOpen]);

  if (!galleryId || !info) return <Navigate to="/admin/website#photo-library" replace />;

  function updateGallery(updater: (entries: GalleryAlbum[]) => GalleryAlbum[]) {
    setAlbums((current) => ({
      ...current,
      [galleryId]: updater(current[galleryId]).map((album, index) => ({ ...album, order: index })),
    }));
    setSaveState("idle");
    setMessage("");
  }

  function updateAlbum(albumId: string, updater: (album: GalleryAlbum) => GalleryAlbum) {
    updateGallery((entries) => entries.map((album) =>
      album.id === albumId ? { ...updater(album), updatedAt: new Date().toISOString() } : album));
  }

  function updatePhoto(photoId: string, updater: (photo: GalleryPhoto) => GalleryPhoto) {
    if (!selectedAlbum) return;
    updateAlbum(selectedAlbum.id, (album) => ({
      ...album,
      photos: album.photos.map((photo) =>
        photo.id === photoId ? { ...updater(photo), updatedAt: new Date().toISOString() } : photo),
    }));
  }

  function addAlbum(title?: string) {
    const album = newAlbum(galleryId, title?.trim() || undefined);
    updateGallery((entries) => [...entries, { ...album, order: entries.length }]);
    setSelectedAlbumId(album.id);
    setUploadAlbumId(album.id);
    return album.id;
  }

  function deleteAlbum(album: GalleryAlbum) {
    if (album.photos.some((photo) => !photo.trashedAt)) {
      setMessage("Move this album's photographs to another album or to trash before removing it.");
      setSaveState("error");
      return;
    }
    if (!window.confirm(`Permanently remove the empty album “${album.title}”?`)) return;
    updateGallery((entries) => entries.filter((entry) => entry.id !== album.id));
    setSelectedAlbumId("");
  }

  async function saveDraft() {
    setSaveState("saving");
    setMessage("Saving gallery draft…");
    try {
      const result = await adminApi<{ albums: GalleryAlbums; updatedAt: string }>("/api/admin/galleries", {
        method: "PUT",
        body: JSON.stringify({ albums, galleryId, expectedUpdatedAt: draftUpdatedAt }),
      });
      setAlbums(result.albums);
      setSavedSnapshot(JSON.stringify(result.albums));
      setDraftUpdatedAt(result.updatedAt);
      setSaveState("saved");
      setMessage("Draft saved.");
      return result.updatedAt;
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "The gallery draft could not be saved.");
      return null;
    }
  }

  async function publishGallery() {
    let expected = draftUpdatedAt;
    if (dirty || !expected) {
      expected = await saveDraft();
      if (!expected) return;
    }
    setSaveState("saving");
    setMessage("Publishing gallery…");
    try {
      const result = await adminApi<{ albums: GalleryAlbums; publishedAt: string; updatedAt: string }>("/api/admin/galleries", {
        method: "POST",
        body: JSON.stringify({ action: "publish", confirmed: true, galleryId, expectedUpdatedAt: expected }),
      });
      setAlbums(result.albums);
      setPublished(result.albums);
      setSavedSnapshot(JSON.stringify(result.albums));
      setDraftUpdatedAt(result.updatedAt);
      setLastPublishedAt(result.publishedAt);
      setPublishConfirmOpen(false);
      setSaveState("saved");
      setMessage("Gallery published.");
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "The gallery could not be published.");
    }
  }

  function moveAlbum(albumId: string, direction: -1 | 1) {
    const index = currentAlbums.findIndex((album) => album.id === albumId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= currentAlbums.length) return;
    updateGallery((entries) => move(entries, index, target));
  }

  function dropAlbum(targetId: string) {
    const from = currentAlbums.findIndex((album) => album.id === draggedAlbumId);
    const to = currentAlbums.findIndex((album) => album.id === targetId);
    setDraggedAlbumId("");
    if (from < 0 || to < 0 || from === to) return;
    updateGallery((entries) => move(entries, from, to));
  }

  function dropPhoto(targetId: string) {
    if (!selectedAlbum) return;
    const from = selectedAlbum.photos.findIndex((photo) => photo.id === draggedPhotoId);
    const to = selectedAlbum.photos.findIndex((photo) => photo.id === targetId);
    setDraggedPhotoId("");
    if (from < 0 || to < 0 || from === to) return;
    updateAlbum(selectedAlbum.id, (album) => ({ ...album, photos: move(album.photos, from, to) }));
  }

  function togglePhoto(photoId: string) {
    setSelectedPhotoIds((current) =>
      current.includes(photoId) ? current.filter((id) => id !== photoId) : [...current, photoId]);
  }

  function setSelectedVisibility(visibility: GalleryPhoto["visibility"]) {
    if (!selectedAlbum || !selectedSet.size) return;
    updateAlbum(selectedAlbum.id, (album) => ({
      ...album,
      photos: album.photos.map((photo) => selectedSet.has(photo.id) ? { ...photo, visibility } : photo),
    }));
    setSelectedPhotoIds([]);
  }

  function moveSelectedPhotos() {
    if (!selectedAlbum || !moveTargetId || moveTargetId === selectedAlbum.id || !selectedSet.size) return;
    const moving = selectedAlbum.photos.filter((photo) => selectedSet.has(photo.id));
    updateGallery((entries) => entries.map((album) => {
      if (album.id === selectedAlbum.id) {
        return {
          ...album,
          coverPhotoId: moving.some((photo) => photo.id === album.coverPhotoId) ? undefined : album.coverPhotoId,
          photos: album.photos.filter((photo) => !selectedSet.has(photo.id)),
          updatedAt: new Date().toISOString(),
        };
      }
      return album.id === moveTargetId
        ? { ...album, photos: [...album.photos, ...moving], updatedAt: new Date().toISOString() }
        : album;
    }));
    setSelectedPhotoIds([]);
    setMessage(`${moving.length} photo${moving.length === 1 ? "" : "s"} moved.`);
  }

  function confirmTrash() {
    if (!selectedAlbum || !selectedSet.size) return;
    const now = new Date().toISOString();
    const ids = [...selectedPhotoIds];
    updateAlbum(selectedAlbum.id, (album) => ({
      ...album,
      coverPhotoId: ids.includes(album.coverPhotoId || "") ? undefined : album.coverPhotoId,
      photos: album.photos.map((photo) => selectedSet.has(photo.id) ? { ...photo, trashedAt: now } : photo),
    }));
    setUndoPhotoIds(ids);
    setSelectedPhotoIds([]);
    setTrashConfirmOpen(false);
    setMessage(`${ids.length} photo${ids.length === 1 ? "" : "s"} moved to trash. They will be retained until permanently removed.`);
  }

  function undoTrash() {
    if (!selectedAlbum || !undoPhotoIds.length) return;
    const ids = new Set(undoPhotoIds);
    updateAlbum(selectedAlbum.id, (album) => ({
      ...album,
      photos: album.photos.map((photo) => ids.has(photo.id) ? { ...photo, trashedAt: undefined } : photo),
    }));
    setUndoPhotoIds([]);
    setMessage("Photos restored.");
  }

  function restoreSelected() {
    if (!selectedAlbum || !selectedSet.size) return;
    updateAlbum(selectedAlbum.id, (album) => ({
      ...album,
      photos: album.photos.map((photo) => selectedSet.has(photo.id) ? { ...photo, trashedAt: undefined } : photo),
    }));
    setSelectedPhotoIds([]);
    setMessage("Selected photos restored.");
  }

  function permanentlyDeleteSelected() {
    if (!selectedAlbum || !selectedSet.size) return;
    if (!window.confirm(`Permanently remove ${selectedSet.size} selected photo record${selectedSet.size === 1 ? "" : "s"}? This cannot be undone. Stored files are retained for safety.`)) return;
    updateAlbum(selectedAlbum.id, (album) => ({
      ...album,
      photos: album.photos.filter((photo) => !selectedSet.has(photo.id)),
    }));
    setSelectedPhotoIds([]);
    setMessage("Photo records permanently removed. Storage objects were retained for safe manual cleanup.");
  }

  function addUploadFiles(files: File[]) {
    const next: UploadJob[] = [];
    for (const file of files) {
      const validation = validateGallerySource(file);
      next.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: validation ? "failed" : "queued",
        progress: 0,
        message: validation || undefined,
      });
    }
    setUploadJobs((current) => [...current, ...next]);
  }

  async function runUploads(jobIds?: string[], forceDuplicate = false) {
    let targetId = uploadAlbumId;
    if (targetId === "__new__") {
      if (!newUploadAlbumTitle.trim()) {
        setMessage("Name the new album before uploading.");
        return;
      }
      targetId = addAlbum(newUploadAlbumTitle);
      setUploadAlbumId(targetId);
    }
    if (!targetId) {
      setMessage("Choose an album for these photographs.");
      return;
    }

    const jobs = uploadJobs.filter((job) =>
      (!jobIds || jobIds.includes(job.id)) &&
      (job.status === "queued" || job.status === "failed" || (forceDuplicate && job.status === "duplicate")));
    const knownHashes = new Set(Object.values(albums).flatMap((entries) =>
      entries.flatMap((album) => album.photos.map((photo) => photo.sha256).filter(Boolean) as string[])));
    let cursor = 0;

    const patchJob = (id: string, patch: Partial<UploadJob>) =>
      setUploadJobs((current) => current.map((job) => job.id === id ? { ...job, ...patch } : job));

    async function worker() {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        patchJob(job.id, { status: "preparing", progress: 2, message: "Correcting orientation and optimizing…" });
        try {
          const prepared = await prepareGalleryImage(job.file);
          if (knownHashes.has(prepared.sha256) && !forceDuplicate) {
            patchJob(job.id, { status: "duplicate", progress: 100, message: "Possible duplicate. Retry to upload anyway." });
            continue;
          }
          patchJob(job.id, { status: "uploading", progress: 8, message: "Uploading optimized image…" });
          const full = await uploadGalleryAsset(prepared.full, (progress) =>
            patchJob(job.id, { progress: 8 + Math.round(progress * .72) }));
          let thumbnailUrl: string | undefined;
          let thumbnailWarning = "";
          try {
            const thumbnail = await uploadGalleryAsset(prepared.thumbnail, (progress) =>
              patchJob(job.id, { progress: 80 + Math.round(progress * .2), message: "Uploading thumbnail…" }));
            thumbnailUrl = thumbnail.url;
          } catch {
            thumbnailWarning = " Uploaded successfully; the optimized image will also be used as its thumbnail.";
          }
          const now = new Date().toISOString();
          const photo: GalleryPhoto = {
            id: `photo-${crypto.randomUUID()}`,
            src: full.url,
            ...(thumbnailUrl ? { thumbnailSrc: thumbnailUrl } : {}),
            alt: job.file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
            objectPosition: "50% 50%",
            width: prepared.width,
            height: prepared.height,
            sha256: full.sha256 || prepared.sha256,
            visibility: "published",
            createdAt: now,
            updatedAt: now,
          };
          setAlbums((current) => ({
            ...current,
            [galleryId]: current[galleryId].map((album) =>
              album.id === targetId ? { ...album, photos: [...album.photos, photo], updatedAt: now } : album),
          }));
          knownHashes.add(prepared.sha256);
          patchJob(job.id, { status: "success", progress: 100, message: `Uploaded.${thumbnailWarning}` });
        } catch (error) {
          patchJob(job.id, {
            status: "failed",
            message: error instanceof Error ? error.message : "Upload failed.",
          });
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, () => worker()));
    setSaveState("idle");
  }

  function closeUploads() {
    uploadJobsRef.current.forEach((job) => URL.revokeObjectURL(job.previewUrl));
    setUploadJobs([]);
    setUploadOpen(false);
  }

  if (!session.checked) return <section className="container-shell py-20" aria-live="polite" />;
  if (!session.admin) {
    return <section className="container-shell py-20"><form onSubmit={session.login} className="admin-login-card">
      <AdminLoginFields name={session.name} password={session.password} error={session.error} setName={session.setName} setPassword={session.setPassword} />
    </form></section>;
  }
  if (!session.admin.selectedDojoId) {
    return <AdminDojoSelector dojos={session.dojos} admin={session.admin} busyId={session.selecting} error={session.error} onSelect={(id) => void session.selectDojo(id)} />;
  }
  if (session.admin.permissionLevel !== "renshinkan_super_admin") return <Navigate to="/admin/students" replace />;

  return (
    <section className="admin-gallery-manager">
      <header className="admin-gallery-manager__header">
        <div>
          <Link to="/admin/website#photo-library" className="text-link"><ArrowLeft size={16} /> Back to website editor</Link>
          <p className="eyebrow">{info.page} / {info.presentation}</p>
          <h1>{info.name}</h1>
          <p>Arrange albums and photographs here. Save a draft, preview the public result, then publish when it is ready.</p>
        </div>
        <div className="admin-gallery-manager__header-actions">
          <span className={`admin-save-state is-${saveState}`}>
            {saveState === "saving" || saveState === "loading" ? <LoaderCircle className="animate-spin" size={15} /> : saveState === "error" ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
            {saveState === "loading" ? "Loading" : saveState === "saving" ? "Saving" : saveState === "error" ? "Error" : dirty ? "Unsaved changes" : "Saved"}
          </span>
          <button type="button" className="btn-secondary" onClick={() => setPreviewOpen(true)} disabled={saveState === "loading"}><Eye size={17} /> Preview</button>
          <button type="button" className="btn-secondary" onClick={() => void saveDraft()} disabled={!dirty || saveState === "saving"}><Save size={17} /> Save draft</button>
          <button type="button" className="btn-primary" onClick={() => setPublishConfirmOpen(true)} disabled={saveState === "loading"}>Review &amp; publish</button>
        </div>
      </header>

      {message ? (
        <div className={`admin-gallery-message ${saveState === "error" ? "is-error" : ""}`} role="status">
          <span>{message}</span>
          {undoPhotoIds.length ? <button type="button" onClick={undoTrash}><RotateCcw size={15} /> Undo</button> : null}
        </div>
      ) : null}

      <section className="admin-album-board" aria-labelledby="album-board-title">
        <header>
          <div><h2 id="album-board-title">Albums</h2><p>{currentAlbums.length} album{currentAlbums.length === 1 ? "" : "s"} · {galleryPhotoCount(currentAlbums)} active photos</p></div>
          <button type="button" className="btn-secondary" onClick={() => addAlbum()}><Images size={17} /> Create album</button>
        </header>
        {currentAlbums.length ? (
          <div className="admin-album-board__grid">
            {currentAlbums.map((album, index) => {
              const cover = galleryCover(album);
              const activeCount = album.photos.filter((photo) => !photo.trashedAt).length;
              const matchesPublished = JSON.stringify(album) === JSON.stringify(publishedGallery.find((entry) => entry.id === album.id));
              return (
                <article
                  key={album.id}
                  className={`admin-album-card ${album.id === selectedAlbumId ? "is-active" : ""}`}
                  draggable
                  onDragStart={() => setDraggedAlbumId(album.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropAlbum(album.id)}
                >
                  <button type="button" className="admin-album-card__cover" onClick={() => setSelectedAlbumId(album.id)}>
                    {cover ? <img src={cover.thumbnailSrc || cover.src} alt="" loading="lazy" style={{ objectPosition: cover.objectPosition }} /> : <span><ImagePlus size={24} /> Empty album</span>}
                  </button>
                  <div className="admin-album-card__body">
                    <span className="admin-album-card__drag"><GripVertical size={16} /> Drag to reorder</span>
                    <h3>{album.title}</h3>
                    <p>{activeCount} photo{activeCount === 1 ? "" : "s"} · {album.visibility}</p>
                    <div className="admin-album-card__status">
                      <span className={matchesPublished ? "is-published" : "is-draft"}>{matchesPublished ? "Published" : "Draft changes"}</span>
                    </div>
                    <div className="admin-album-card__actions">
                      <button type="button" onClick={() => setSelectedAlbumId(album.id)}>Open album</button>
                      <button type="button" aria-label={`Move ${album.title} up`} disabled={index === 0} onClick={() => moveAlbum(album.id, -1)}><ArrowUp size={15} /></button>
                      <button type="button" aria-label={`Move ${album.title} down`} disabled={index === currentAlbums.length - 1} onClick={() => moveAlbum(album.id, 1)}><ArrowDown size={15} /></button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <p className="admin-gallery-empty">No albums yet. Create the first album to begin.</p>}
      </section>

      {selectedAlbum ? (
        <section className="admin-album-workspace">
          <header>
            <div><p className="eyebrow">Album details</p><h2>{selectedAlbum.title}</h2></div>
            <button type="button" className="btn-secondary" onClick={() => { setUploadAlbumId(selectedAlbum.id); setUploadOpen(true); }}><UploadCloud size={17} /> Upload photos</button>
          </header>
          <div className="admin-album-fields">
            <label>Album title<input value={selectedAlbum.title} maxLength={160} onChange={(event) => updateAlbum(selectedAlbum.id, (album) => ({ ...album, title: event.target.value }))} /></label>
            <label>Event or examination date <span>Optional</span><GregorianDateInput admin value={selectedAlbum.date || ""} onChange={(value) => updateAlbum(selectedAlbum.id, (album) => ({ ...album, date: value || undefined }))} /></label>
            <label>Visibility<select value={selectedAlbum.visibility} onChange={(event) => updateAlbum(selectedAlbum.id, (album) => ({ ...album, visibility: event.target.value as GalleryAlbum["visibility"] }))}><option value="draft">Draft</option><option value="published">Published</option><option value="hidden">Hidden</option></select></label>
            <label className="admin-album-fields__description">Description <span>Optional</span><textarea value={selectedAlbum.description || ""} maxLength={2000} onChange={(event) => updateAlbum(selectedAlbum.id, (album) => ({ ...album, description: event.target.value || undefined }))} /></label>
          </div>

          <div className="admin-photo-toolbar">
            <div>
              <button type="button" className={selectionMode ? "is-active" : ""} onClick={() => { setSelectionMode((value) => !value); setSelectedPhotoIds([]); }}>
                <Check size={16} /> {selectionMode ? "Exit selection" : "Select photos"}
              </button>
              <button type="button" className={showTrash ? "is-active" : ""} onClick={() => { setShowTrash((value) => !value); setSelectedPhotoIds([]); setVisibleCount(PAGE_SIZE); }}>
                <Trash2 size={16} /> {showTrash ? "View album" : `Trash (${trashPhotos.length})`}
              </button>
            </div>
            <p>{showTrash ? trashPhotos.length : activePhotos.length} photo{(showTrash ? trashPhotos.length : activePhotos.length) === 1 ? "" : "s"}</p>
          </div>

          {selectionMode ? (
            <div className="admin-selection-bar">
              <strong>{selectedSet.size} selected</strong>
              <button type="button" onClick={() => setSelectedPhotoIds((showTrash ? trashPhotos : activePhotos).map((photo) => photo.id))}>Select all</button>
              <button type="button" onClick={() => setSelectedPhotoIds([])}>Deselect all</button>
              {showTrash ? (
                <>
                  <button type="button" onClick={restoreSelected} disabled={!selectedSet.size}><RotateCcw size={15} /> Restore</button>
                  <button type="button" className="is-danger" onClick={permanentlyDeleteSelected} disabled={!selectedSet.size}><Trash2 size={15} /> Permanently remove</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setSelectedVisibility("published")} disabled={!selectedSet.size}><Eye size={15} /> Show</button>
                  <button type="button" onClick={() => setSelectedVisibility("hidden")} disabled={!selectedSet.size}><EyeOff size={15} /> Hide</button>
                  <label>Move to<select value={moveTargetId} onChange={(event) => setMoveTargetId(event.target.value)}><option value="">Choose album</option>{currentAlbums.filter((album) => album.id !== selectedAlbum.id).map((album) => <option key={album.id} value={album.id}>{album.title}</option>)}</select></label>
                  <button type="button" onClick={moveSelectedPhotos} disabled={!selectedSet.size || !moveTargetId}>Move</button>
                  <button type="button" className="is-danger" onClick={() => setTrashConfirmOpen(true)} disabled={!selectedSet.size}><Trash2 size={15} /> Move to trash</button>
                </>
              )}
            </div>
          ) : null}

          {(showTrash ? trashPhotos : activePhotos).length ? (
            <>
              <ul className="admin-photo-grid">
                {displayedPhotos.map((photo) => (
                  <li
                    key={photo.id}
                    className={`${selectedSet.has(photo.id) ? "is-selected" : ""} ${photo.visibility === "hidden" ? "is-hidden" : ""}`}
                    draggable={!selectionMode && !showTrash}
                    onDragStart={() => setDraggedPhotoId(photo.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => dropPhoto(photo.id)}
                  >
                    {selectionMode ? <label className="admin-photo-grid__check"><input type="checkbox" checked={selectedSet.has(photo.id)} onChange={() => togglePhoto(photo.id)} /><span className="sr-only">Select {photo.alt || "photo"}</span></label> : null}
                    <button type="button" className="admin-photo-grid__image" onClick={() => selectionMode ? togglePhoto(photo.id) : setActivePhotoId(photo.id)}>
                      <img src={photo.thumbnailSrc || photo.src} alt={photo.alt} loading="lazy" width={photo.width || 800} height={photo.height || 600} style={{ objectPosition: photo.objectPosition }} />
                    </button>
                    <div className="admin-photo-grid__meta">
                      {!showTrash ? <span><GripVertical size={14} /> Drag</span> : <time>{photo.trashedAt ? formatAdminDate(photo.trashedAt) : ""}</time>}
                      {selectedAlbum.coverPhotoId === photo.id ? <strong><Star size={13} /> Cover</strong> : null}
                      {photo.visibility === "hidden" ? <strong><EyeOff size={13} /> Hidden</strong> : null}
                    </div>
                  </li>
                ))}
              </ul>
              {displayedPhotos.length < (showTrash ? trashPhotos.length : activePhotos.length) ? (
                <button type="button" className="btn-secondary admin-photo-load-more" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                  Load {Math.min(PAGE_SIZE, (showTrash ? trashPhotos.length : activePhotos.length) - displayedPhotos.length)} more
                </button>
              ) : null}
            </>
          ) : <p className="admin-gallery-empty">{showTrash ? "Trash is empty." : "This album has no photographs yet."}</p>}

          <footer className="admin-album-workspace__footer">
            <button type="button" className="text-link is-danger" onClick={() => deleteAlbum(selectedAlbum)}><Trash2 size={15} /> Remove empty album</button>
          </footer>
        </section>
      ) : null}

      {activePhoto && selectedAlbum ? (
        <div className="admin-photo-editor-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setActivePhotoId(""); }}>
          <aside className="admin-photo-editor" role="dialog" aria-modal="true" aria-labelledby="photo-editor-title">
            <header><div><p className="eyebrow">Photo details</p><h2 id="photo-editor-title">Edit photograph</h2></div><button type="button" onClick={() => setActivePhotoId("")} aria-label="Close photo editor"><X /></button></header>
            <img src={activePhoto.src} alt={activePhoto.alt} style={{ objectPosition: activePhoto.objectPosition }} />
            <label>Alternative text <span>Describe the image for people who cannot see it.</span><textarea value={activePhoto.alt} maxLength={300} onChange={(event) => updatePhoto(activePhoto.id, (photo) => ({ ...photo, alt: event.target.value }))} /></label>
            <label>Caption <span>Optional</span><textarea value={activePhoto.caption || ""} maxLength={1000} onChange={(event) => updatePhoto(activePhoto.id, (photo) => ({ ...photo, caption: event.target.value || undefined }))} /></label>
            <fieldset>
              <legend>Focal point</legend>
              <p>Move the focus toward important faces for cropped previews.</p>
              <label>Horizontal<input type="range" min="0" max="100" value={photoPosition(activePhoto.objectPosition).x} onChange={(event) => updatePhoto(activePhoto.id, (photo) => ({ ...photo, objectPosition: `${event.target.value}% ${photoPosition(photo.objectPosition).y}%` }))} /></label>
              <label>Vertical<input type="range" min="0" max="100" value={photoPosition(activePhoto.objectPosition).y} onChange={(event) => updatePhoto(activePhoto.id, (photo) => ({ ...photo, objectPosition: `${photoPosition(photo.objectPosition).x}% ${event.target.value}%` }))} /></label>
            </fieldset>
            <div className="admin-photo-editor__actions">
              <button type="button" className="btn-secondary" onClick={() => updateAlbum(selectedAlbum.id, (album) => ({ ...album, coverPhotoId: activePhoto.id }))}><Star size={16} /> Set as album cover</button>
              <button type="button" className="btn-primary" onClick={() => setActivePhotoId("")}>Done</button>
            </div>
          </aside>
        </div>
      ) : null}

      {uploadOpen ? (
        <div className="admin-upload-overlay">
          <section ref={uploadDialogRef} className="admin-upload-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-dialog-title">
            <header><div><p className="eyebrow">Add photographs</p><h2 id="upload-dialog-title">Upload to an album</h2></div><button ref={uploadCloseRef} type="button" onClick={closeUploads} aria-label="Close upload dialog"><X /></button></header>
            <div className="admin-upload-target">
              <label>Destination album<select value={uploadAlbumId} onChange={(event) => setUploadAlbumId(event.target.value)}><option value="">Choose album</option>{currentAlbums.map((album) => <option key={album.id} value={album.id}>{album.title}</option>)}<option value="__new__">Create a new album</option></select></label>
              {uploadAlbumId === "__new__" ? <label>New album title<input value={newUploadAlbumTitle} maxLength={160} onChange={(event) => setNewUploadAlbumTitle(event.target.value)} /></label> : null}
            </div>
            <button
              type="button"
              className="admin-upload-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event: DragEvent) => { event.preventDefault(); addUploadFiles(Array.from(event.dataTransfer.files)); }}
            >
              <UploadCloud size={32} />
              <strong>Drop photos here</strong>
              <span>or choose JPEG, PNG, or WebP files · up to 15 MB each</span>
              <input ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event: ChangeEvent<HTMLInputElement>) => { addUploadFiles(Array.from(event.target.files || [])); event.target.value = ""; }} />
            </button>
            {uploadJobs.length ? (
              <>
                <div className="admin-upload-overall"><span>Overall progress</span><strong>{uploadProgress}%</strong><progress max="100" value={uploadProgress} /></div>
                <ul className="admin-upload-list">{uploadJobs.map((job) => (
                  <li key={job.id}>
                    <img src={job.previewUrl} alt="" />
                    <div><strong>{job.file.name}</strong><span>{job.message || job.status}</span><progress max="100" value={job.progress} /></div>
                    <span className={`is-${job.status}`}>{job.status === "success" ? <CheckCircle2 /> : job.status === "failed" || job.status === "duplicate" ? <AlertCircle /> : <LoaderCircle className={job.status === "queued" ? "" : "animate-spin"} />}</span>
                    {job.status === "failed" ? <button type="button" onClick={() => void runUploads([job.id], true)}>Retry</button> : null}
                    {job.status === "duplicate" ? <button type="button" onClick={() => void runUploads([job.id], true)}>Upload anyway</button> : null}
                  </li>
                ))}</ul>
              </>
            ) : null}
            <footer>
              <button type="button" className="btn-secondary" onClick={closeUploads}>Close</button>
              <button type="button" className="btn-primary" onClick={() => void runUploads()} disabled={!uploadJobs.some((job) => job.status === "queued" || job.status === "failed")}>Upload photos</button>
            </footer>
          </section>
        </div>
      ) : null}

      {trashConfirmOpen && selectedAlbum ? (
        <div className="admin-confirm-overlay">
          <section className="admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="trash-confirm-title">
            <header><h2 id="trash-confirm-title">Move selected photos to trash?</h2><button type="button" onClick={() => setTrashConfirmOpen(false)} aria-label="Close"><X /></button></header>
            <p>The photos remain recoverable and the stored files will not be deleted.</p>
            <div className="admin-confirm-thumbnails">{selectedAlbum.photos.filter((photo) => selectedSet.has(photo.id)).slice(0, 12).map((photo) => <img key={photo.id} src={photo.thumbnailSrc || photo.src} alt="" style={{ objectPosition: photo.objectPosition }} />)}</div>
            <footer><button type="button" className="btn-secondary" onClick={() => setTrashConfirmOpen(false)}>Cancel</button><button type="button" className="btn-primary is-danger" onClick={confirmTrash}><Trash2 size={16} /> Move {selectedSet.size} to trash</button></footer>
          </section>
        </div>
      ) : null}

      {previewOpen ? (
        <div className="admin-gallery-preview-overlay">
          <section className="admin-gallery-preview" role="dialog" aria-modal="true" aria-labelledby="gallery-preview-title">
            <header><div><p className="eyebrow">Exact public presentation</p><h2 id="gallery-preview-title">{info.name} preview</h2></div><button type="button" onClick={() => setPreviewOpen(false)} aria-label="Close preview"><X /></button></header>
            <div className="admin-gallery-preview__canvas">
              {galleryId === "on-the-mat" ? <EditorialGallery albums={currentAlbums} /> : galleryId === "history" ? <HistoricalTimelineGallery albums={currentAlbums} /> : <AchievementAlbumsGallery albums={currentAlbums} />}
            </div>
          </section>
        </div>
      ) : null}

      {publishConfirmOpen ? (
        <div className="admin-confirm-overlay">
          <section className="admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="publish-gallery-title">
            <header><div><p className="eyebrow">Review &amp; publish</p><h2 id="publish-gallery-title">Publish {info.name}?</h2></div><button type="button" onClick={() => setPublishConfirmOpen(false)} aria-label="Close"><X /></button></header>
            <dl>
              <div><dt>Albums</dt><dd>{currentAlbums.length}</dd></div>
              <div><dt>Active photos</dt><dd>{galleryPhotoCount(currentAlbums)}</dd></div>
              <div><dt>Unpublished changes</dt><dd>{publicChanged ? "Yes" : "No"}</dd></div>
              <div><dt>Last published</dt><dd>{lastPublishedAt ? formatAdminDate(lastPublishedAt) : "Not available"}</dd></div>
            </dl>
            <p>Draft and hidden albums will remain private. Trashed photographs will not appear publicly.</p>
            <footer><button type="button" className="btn-secondary" onClick={() => setPublishConfirmOpen(false)}>Cancel</button><button type="button" className="btn-primary" onClick={() => void publishGallery()} disabled={saveState === "saving"}><Save size={16} /> Publish gallery</button></footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
