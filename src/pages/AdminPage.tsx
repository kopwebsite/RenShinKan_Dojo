import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  FileText,
  ImagePlus,
  Lock,
  LogOut,
  Plus,
  Presentation,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { EventBodyRenderer } from "../components/EventBodyRenderer";
import {
  historyMedia as defaultHistoryMedia,
  onTheMatMedia as defaultOnTheMatMedia,
  passedTestStudents as defaultPassedTestStudents,
} from "../data/editableContent";
import { emptyEditableContent, loadEditableContent } from "../lib/content";
import type {
  BodyMediaPlacement,
  DocumentMediaKind,
  EditableContent,
  MediaItem,
  PassedTestStudent,
  RecentEvent,
} from "../types/editableContent";
import {
  documentKindLabel,
  documentTitle,
  formatFileSize,
} from "../utils/documentMedia";
import {
  defaultBodyMediaPlacement,
  normalizeBodyMediaPlacement,
  splitEventBodyParagraphs,
} from "../utils/eventBody";
import { isValidEmbedUrl, normalizeEmbedUrl } from "../utils/mediaEmbeds";

const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;
const MAX_DOCUMENT_FILE_SIZE = 20 * 1024 * 1024;
const MAX_FILES = 10;
const MAX_EVENT_PHOTOS = 6;
const UPLOAD_IMAGE_MAX_WIDTH = 1920;
const UPLOAD_IMAGE_WEBP_QUALITY = 0.86;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_DOCUMENT_TYPES = new Map([
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/vnd.ms-powerpoint", "ppt"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "ppt"],
] as const);
const ALLOWED_DOCUMENT_EXTENSIONS = new Map([
  [".pdf", "pdf"],
  [".docx", "docx"],
  [".ppt", "ppt"],
  [".pptx", "ppt"],
] as const);
const DOCUMENT_ACCEPT = [
  ".pdf",
  ".docx",
  ".ppt",
  ".pptx",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
].join(",");

type AdminSectionId = "recentEvents" | "onTheMatMedia" | "historyMedia" | "passedTestStudents";

type PendingUpload = {
  id: string;
  file: File;
  previewUrl: string;
};

type PublishResult = {
  ok?: boolean;
  content?: EditableContent;
  warnings?: string[];
  error?: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "Images must be JPEG, PNG, or WebP.";
  }

  if (file.size > MAX_IMAGE_FILE_SIZE) {
    return "Images must be 5 MB or smaller.";
  }

  return null;
}

function imageUploadName(file: File) {
  const safeBase = file.name
    .replace(/\.[^.]+$/, "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);

  return `${safeBase || "image"}.webp`;
}

function imageAltFromFileName(file: File) {
  return file.name.replace(/\.[^.]+$/, "");
}

function canvasToWebpBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Image conversion to WebP failed."));
          return;
        }

        resolve(blob);
      },
      "image/webp",
      UPLOAD_IMAGE_WEBP_QUALITY,
    );
  });
}

async function loadImageBitmap(file: File) {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Image could not be loaded for conversion."));
      element.src = objectUrl;
    });

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function convertImageFileToWebp(file: File) {
  const image = await loadImageBitmap(file);
  const sourceWidth = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const sourceHeight = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  const scale = Math.min(1, UPLOAD_IMAGE_MAX_WIDTH / sourceWidth);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Image conversion is not supported in this browser.");
  }

  context.drawImage(image, 0, 0, width, height);

  if ("close" in image && typeof image.close === "function") {
    image.close();
  }

  const blob = await canvasToWebpBlob(canvas);

  return new File([blob], imageUploadName(file), {
    type: "image/webp",
    lastModified: Date.now(),
  });
}

async function prepareImageUpload(file: File): Promise<PendingUpload & { alt: string }> {
  const convertedFile = await convertImageFileToWebp(file);

  return {
    id: `upload-${crypto.randomUUID()}`,
    file: convertedFile,
    previewUrl: URL.createObjectURL(convertedFile),
    alt: imageAltFromFileName(file),
  };
}

function fileExtension(name: string) {
  return name.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? "";
}

function documentKindForFile(file: File): DocumentMediaKind | null {
  const byMime = ALLOWED_DOCUMENT_TYPES.get(file.type);
  if (byMime) {
    return byMime;
  }

  return ALLOWED_DOCUMENT_EXTENSIONS.get(fileExtension(file.name)) ?? null;
}

function validateDocumentFile(file: File): string | null {
  const kind = documentKindForFile(file);

  if (!kind) {
    return "Documents must be PDF, DOCX, PPT, or PPTX files.";
  }

  if (file.size > MAX_DOCUMENT_FILE_SIZE) {
    return "Documents must be 20 MB or smaller.";
  }

  return null;
}

type DefaultMedia = {
  id: string;
  src: string;
  type?: "image" | "video";
  alt?: string;
  caption?: string;
  title?: string;
  objectPosition?: string;
  avif?: string;
  webp?: string;
  width?: number;
  height?: number;
};

function toMediaItem(value: DefaultMedia): MediaItem {
  return {
    id: value.id,
    src: value.src,
    type: value.type === "video" ? "video" : "image",
    alt: value.alt ?? "",
    caption: value.caption,
    title: value.title,
    objectPosition: value.objectPosition,
    avif: value.avif,
    webp: value.webp,
    width: value.width,
    height: value.height,
  };
}

type DefaultStudent = {
  id: string;
  image: string;
  alt?: string;
  name?: string;
  caption?: string;
  date?: string;
  dateAdded?: string;
  objectPosition?: string;
};

function toPassedStudent(value: DefaultStudent): PassedTestStudent {
  return {
    id: value.id,
    image: value.image,
    alt: value.alt,
    name: value.name,
    caption: value.caption,
    date: value.date,
    dateAdded: value.dateAdded,
    objectPosition: value.objectPosition,
  };
}

function makeEvent(): RecentEvent {
  const now = new Date().toISOString();
  const id = `event-${crypto.randomUUID()}`;

  return {
    id,
    title: "",
    date: now.slice(0, 10),
    summary: "",
    body: "",
    slug: "",
    published: false,
    image: undefined,
    media: [],
    notifySubscribers: false,
    showInCommunityCalendar: false,
    newsletter: {
      status: "not_sent",
      sentAt: null,
      brevoCampaignId: null,
      error: null,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function eventSnapshot(event?: RecentEvent) {
  if (!event) {
    return "";
  }

  return JSON.stringify({
    title: event.title,
    date: event.date,
    summary: event.summary,
    body: event.body,
    slug: event.slug,
    published: event.published,
    image: event.image,
    media: event.media,
    notifySubscribers: event.notifySubscribers,
    showInCommunityCalendar: event.showInCommunityCalendar,
    newsletter: event.newsletter,
  });
}

function statusLabel(event: RecentEvent) {
  const status = event.newsletter?.status ?? "not_sent";

  if (status === "sent") {
    return event.newsletter?.sentAt ? `sent ${new Date(event.newsletter.sentAt).toLocaleString()}` : "sent";
  }

  if (status === "failed") {
    return event.newsletter?.error ? `failed: ${event.newsletter.error}` : "failed";
  }

  return status.replace("_", " ");
}

function hasSentNewsletter(event?: RecentEvent) {
  return event?.newsletter?.status === "sent";
}

function getEventMedia(event: RecentEvent) {
  if (event.media?.length) {
    return event.media;
  }

  return event.image ? [event.image] : [];
}

function eventPhotoCount(event: RecentEvent) {
  return getEventMedia(event).filter((item) => item.type === "image").length;
}

function eventDocumentCount(event: RecentEvent) {
  return getEventMedia(event).filter((item) => item.type === "document").length;
}

function bodyPositionLabel(position: number, paragraphCount: number) {
  if (paragraphCount === 0) {
    return "In body";
  }

  if (position === 0) {
    return "Before body text";
  }

  if (position >= paragraphCount) {
    return "After body text";
  }

  return `After paragraph ${position}`;
}

function sectionTitle(title: string, copy: string) {
  return (
    <div className="mb-5">
      <h2 className="text-3xl leading-tight text-ink">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-charcoal/72">{copy}</p>
    </div>
  );
}

function CollapsibleEditorSection({
  title,
  copy,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  copy: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = `admin-section-${slugify(title)}`;

  return (
    <section className="surface rounded-[2rem] p-6 sm:p-8">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full flex-col gap-4 text-left sm:flex-row sm:items-start sm:justify-between"
      >
        <span>
          <span className="block text-3xl leading-tight text-ink">{title}</span>
          <span className="mt-2 block max-w-3xl text-sm leading-6 text-charcoal/72">{copy}</span>
          {summary ? <span className="mt-3 block text-sm font-bold text-charcoal/62">{summary}</span> : null}
        </span>
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper/70 text-ink ring-1 ring-ink/10 transition hover:bg-paper">
          <ChevronDown
            size={20}
            aria-hidden="true"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      <div id={panelId} className={open ? "mt-6" : "hidden"}>
        {children}
      </div>
    </section>
  );
}

export function AdminPage() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(() => sessionStorage.getItem("renshinkan-admin-hint") === "true");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [draft, setDraft] = useState<EditableContent>(emptyEditableContent);
  const [baseline, setBaseline] = useState<EditableContent>(emptyEditableContent);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [publishStatus, setPublishStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [publishMessage, setPublishMessage] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [videoEmbedInputs, setVideoEmbedInputs] = useState<Record<string, string>>({});
  const [openSections, setOpenSections] = useState<Record<AdminSectionId, boolean>>({
    recentEvents: false,
    onTheMatMedia: false,
    historyMedia: false,
    passedTestStudents: false,
  });
  const [openEventIds, setOpenEventIds] = useState<string[]>([]);

  useEffect(() => {
    document.documentElement.classList.add("admin-route");
    document.body.classList.add("admin-simple");

    return () => {
      document.documentElement.classList.remove("admin-route");
      document.body.classList.remove("admin-simple");
    };
  }, []);

  useEffect(() => {
    fetch("/api/admin/session", { credentials: "include" })
      .then((response) => response.json() as Promise<{ authenticated?: boolean }>)
      .then((result) => {
        const authenticated = result.authenticated === true;
        setIsAuthed(authenticated);
        sessionStorage.setItem("renshinkan-admin-hint", authenticated ? "true" : "false");
      })
      .catch(() => {
        setIsAuthed(false);
        sessionStorage.removeItem("renshinkan-admin-hint");
      })
      .finally(() => setSessionChecked(true));
  }, []);

  useEffect(() => {
    if (!isAuthed) {
      return;
    }

    loadEditableContent().then((content) => {
      // Seed the galleries from the built-in defaults when nothing has been
      // published yet, so admins can see and delete the existing photos.
      const seeded: EditableContent = {
        ...content,
        historyMedia: content.historyMedia.length ? content.historyMedia : defaultHistoryMedia.map(toMediaItem),
        onTheMatMedia: content.onTheMatMedia.length ? content.onTheMatMedia : defaultOnTheMatMedia.map(toMediaItem),
        passedTestStudents: content.passedTestStudents.length
          ? content.passedTestStudents
          : defaultPassedTestStudents.map(toPassedStudent),
      };

      setDraft(seeded);
      setBaseline(seeded);
    });
  }, [isAuthed]);

  const pendingById = useMemo(() => {
    return new Map(pendingUploads.map((upload) => [upload.id, upload]));
  }, [pendingUploads]);

  const baselineEvents = useMemo(() => {
    return new Map(baseline.recentEvents.map((event) => [event.id, event]));
  }, [baseline.recentEvents]);

  const changedEvents = useMemo(() => {
    return draft.recentEvents.filter((event) => eventSnapshot(event) !== eventSnapshot(baselineEvents.get(event.id)));
  }, [baselineEvents, draft.recentEvents]);

  const emailEvents = useMemo(() => {
    return draft.recentEvents.filter((event) => {
      const previous = baselineEvents.get(event.id);
      return event.published && event.notifySubscribers === true && !hasSentNewsletter(event) && !hasSentNewsletter(previous);
    });
  }, [baselineEvents, draft.recentEvents]);

  const galleriesChanged = useMemo(() => {
    return (
      JSON.stringify([draft.historyMedia, draft.onTheMatMedia, draft.passedTestStudents]) !==
      JSON.stringify([baseline.historyMedia, baseline.onTheMatMedia, baseline.passedTestStudents])
    );
  }, [draft.historyMedia, draft.onTheMatMedia, draft.passedTestStudents, baseline.historyMedia, baseline.onTheMatMedia, baseline.passedTestStudents]);

  const previewMedia = (event: RecentEvent) => {
    return getEventMedia(event).map((item) => {
      if (!item.src.startsWith("pending:")) {
        return item;
      }

      const upload = pendingById.get(item.src.replace("pending:", ""));
      return upload ? { ...item, src: upload.previewUrl } : item;
    });
  };

  const toggleSection = (section: AdminSectionId) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const toggleEvent = (eventId: string) => {
    setOpenEventIds((current) =>
      current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId],
    );
  };

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError("");

    let response: Response;

    try {
      response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
    } catch {
      setAuthError("Admin API is unavailable.");
      return;
    }

    if (response.ok) {
      sessionStorage.setItem("renshinkan-admin-hint", "true");
      setIsAuthed(true);
      setPassword("");
      return;
    }

    setAuthError(response.status === 403 ? "Login request was blocked." : "Invalid password");
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    sessionStorage.removeItem("renshinkan-admin-hint");
    setIsAuthed(false);
    setDraft(emptyEditableContent);
    setBaseline(emptyEditableContent);
  };

  const updateEvent = (id: string, updater: (event: RecentEvent) => RecentEvent) => {
    setDraft((current) => ({
      ...current,
      recentEvents: current.recentEvents.map((event) => {
        if (event.id !== id) {
          return event;
        }

        return {
          ...updater(event),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  };

  const addEvent = () => {
    const event = makeEvent();
    setDraft((current) => ({
      ...current,
      recentEvents: [event, ...current.recentEvents],
    }));
    setOpenSections((current) => ({ ...current, recentEvents: true }));
    setOpenEventIds((current) => [event.id, ...current]);
  };

  const deleteEvent = (id: string) => {
    const removed = draft.recentEvents.find((event) => event.id === id);

    if (removed) {
      getEventMedia(removed).forEach((item) => removePendingUpload(item.src));
    }

    setDraft((current) => ({
      ...current,
      recentEvents: current.recentEvents.filter((event) => event.id !== id),
    }));
    setOpenEventIds((current) => current.filter((eventId) => eventId !== id));
    setVideoEmbedInputs((current) => {
      const { [id]: _removed, ...rest } = current;
      return rest;
    });
  };

  const addEventPhotos = async (eventId: string, fileEvent: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(fileEvent.target.files ?? []);
    fileEvent.target.value = "";

    if (files.length === 0) {
      return;
    }

    const targetEvent = draft.recentEvents.find((event) => event.id === eventId);
    if (!targetEvent) {
      return;
    }

    if (eventPhotoCount(targetEvent) + files.length > MAX_EVENT_PHOTOS) {
      setPublishStatus("error");
      setPublishMessage(`Recent events can include at most ${MAX_EVENT_PHOTOS} photos.`);
      return;
    }

    if (pendingUploads.length + files.length > MAX_FILES) {
      setPublishStatus("error");
      setPublishMessage(`You can upload at most ${MAX_FILES} files in one publish.`);
      return;
    }

    for (const file of files) {
      const error = validateImageFile(file);

      if (error) {
        setPublishStatus("error");
        setPublishMessage(error);
        return;
      }
    }

    setPublishStatus("saving");
    setPublishMessage("Preparing images as WebP...");

    let preparedUploads: Array<PendingUpload & { alt: string }> = [];

    try {
      for (const file of files) {
        preparedUploads.push(await prepareImageUpload(file));
      }
    } catch (error) {
      preparedUploads.forEach((upload) => URL.revokeObjectURL(upload.previewUrl));
      setPublishStatus("error");
      setPublishMessage(error instanceof Error ? error.message : "Image conversion failed.");
      return;
    }

    const newUploads: PendingUpload[] = preparedUploads.map(({ id, file, previewUrl }) => ({ id, file, previewUrl }));
    const newItems: MediaItem[] = preparedUploads.map((upload) => ({
      id: `media-${crypto.randomUUID()}`,
      src: `pending:${upload.id}`,
      alt: upload.alt,
      type: "image",
      bodyPlacement: defaultBodyMediaPlacement(targetEvent.body),
    }));

    setPendingUploads((current) => [...current, ...newUploads]);
    updateEvent(eventId, (current) => ({
      ...current,
      image: current.image ?? newItems[0],
      media: [...getEventMedia(current), ...newItems],
    }));
    setPublishStatus("idle");
    setPublishMessage("");
  };

  const addEventDocuments = (eventId: string, fileEvent: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(fileEvent.target.files ?? []);
    fileEvent.target.value = "";

    if (files.length === 0) {
      return;
    }

    const targetEvent = draft.recentEvents.find((event) => event.id === eventId);
    if (!targetEvent) {
      return;
    }

    if (pendingUploads.length + files.length > MAX_FILES) {
      setPublishStatus("error");
      setPublishMessage(`You can upload at most ${MAX_FILES} files in one publish.`);
      return;
    }

    for (const file of files) {
      const error = validateDocumentFile(file);

      if (error) {
        setPublishStatus("error");
        setPublishMessage(error);
        return;
      }
    }

    const newUploads: PendingUpload[] = [];
    const newItems: MediaItem[] = files.map((file) => {
      const uploadId = `upload-${crypto.randomUUID()}`;
      const title = file.name.replace(/\.[^.]+$/, "");
      const documentKind = documentKindForFile(file)!;
      newUploads.push({ id: uploadId, file, previewUrl: URL.createObjectURL(file) });

      return {
        id: `media-${crypto.randomUUID()}`,
        src: `pending:${uploadId}`,
        alt: title,
        type: "document",
        title,
        documentKind,
        displayMode: "inline",
        fileName: file.name,
        fileSize: file.size,
        bodyPlacement: defaultBodyMediaPlacement(targetEvent.body),
      };
    });

    setPendingUploads((current) => [...current, ...newUploads]);
    updateEvent(eventId, (current) => ({
      ...current,
      media: [...getEventMedia(current), ...newItems],
    }));
    setPublishStatus("idle");
    setPublishMessage("");
  };

  const addEventVideo = (eventId: string) => {
    const targetEvent = draft.recentEvents.find((event) => event.id === eventId);
    const rawUrl = (videoEmbedInputs[eventId] ?? "").trim();

    if (!targetEvent || !rawUrl) {
      return;
    }

    if (!isValidEmbedUrl(rawUrl)) {
      setPublishStatus("error");
      setPublishMessage("Use a supported HTTPS YouTube or Vimeo URL, or an iframe embed from one of those services.");
      return;
    }

    const mediaItem: MediaItem = {
      id: `media-${crypto.randomUUID()}`,
      src: rawUrl,
      alt: "",
      type: "video",
      title: "Video",
      bodyPlacement: defaultBodyMediaPlacement(targetEvent.body),
    };

    updateEvent(eventId, (current) => ({
      ...current,
      media: [...getEventMedia(current), mediaItem],
    }));
    setVideoEmbedInputs((current) => ({ ...current, [eventId]: "" }));
    setPublishStatus("idle");
    setPublishMessage("");
  };

  const updateEventMediaItem = (
    eventId: string,
    mediaId: string,
    updater: (item: MediaItem) => MediaItem,
  ) => {
    updateEvent(eventId, (current) => {
      const media = getEventMedia(current).map((item) => (item.id === mediaId ? updater(item) : item));
      const image = media.find((item) => item.id === current.image?.id && item.type === "image") ??
        media.find((item) => item.type === "image");

      return { ...current, image, media };
    });
  };

  const updateEventMediaPlacement = (
    eventId: string,
    mediaId: string,
    paragraphCount: number,
    placementUpdate: Partial<Required<BodyMediaPlacement>>,
  ) => {
    updateEventMediaItem(eventId, mediaId, (item) => {
      const currentPlacement = normalizeBodyMediaPlacement(item.bodyPlacement, paragraphCount);

      return {
        ...item,
        bodyPlacement: {
          ...currentPlacement,
          ...placementUpdate,
        },
      };
    });
  };

  const deleteEventMedia = (eventId: string, mediaId: string) => {
    const targetEvent = draft.recentEvents.find((event) => event.id === eventId);
    const removed = targetEvent ? getEventMedia(targetEvent).find((item) => item.id === mediaId) : undefined;

    if (removed) {
      removePendingUpload(removed.src);
    }

    updateEvent(eventId, (current) => {
      const media = getEventMedia(current).filter((item) => item.id !== mediaId);
      const image = media.find((item) => item.id === current.image?.id && item.type === "image") ??
        media.find((item) => item.type === "image");

      return { ...current, image, media };
    });
  };

  const resolveSrc = (src: string) => {
    if (!src.startsWith("pending:")) {
      return src;
    }

    const upload = pendingById.get(src.replace("pending:", ""));
    return upload ? upload.previewUrl : src;
  };

  const removePendingUpload = (src: string) => {
    if (!src.startsWith("pending:")) {
      return;
    }

    const uploadId = src.replace("pending:", "");
    setPendingUploads((current) => {
      const target = current.find((upload) => upload.id === uploadId);

      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }

      return current.filter((upload) => upload.id !== uploadId);
    });
  };

  const addGalleryPhotos = async (key: "historyMedia" | "onTheMatMedia", fileEvent: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(fileEvent.target.files ?? []);
    fileEvent.target.value = "";

    if (files.length === 0) {
      return;
    }

    const availableSlots = MAX_FILES - pendingUploads.length;

    if (availableSlots <= 0) {
      setPublishStatus("error");
      setPublishMessage(`You can add at most ${MAX_FILES} new photos per publish. Publish these first, then add more.`);
      return;
    }

    const filesToPrepare = files.slice(0, availableSlots);

    for (const file of filesToPrepare) {
      const error = validateImageFile(file);

      if (error) {
        setPublishStatus("error");
        setPublishMessage(error);
        return;
      }

    }

    setPublishStatus("saving");
    setPublishMessage("Preparing images as WebP...");

    let preparedUploads: Array<PendingUpload & { alt: string }> = [];

    try {
      preparedUploads = [];

      for (const file of filesToPrepare) {
        preparedUploads.push(await prepareImageUpload(file));
      }
    } catch (conversionError) {
      preparedUploads.forEach((upload) => URL.revokeObjectURL(upload.previewUrl));
      setPublishStatus("error");
      setPublishMessage(conversionError instanceof Error ? conversionError.message : "Image conversion failed.");
      return;
    }

    if (preparedUploads.length === 0) {
      return;
    }

    const newUploads: PendingUpload[] = preparedUploads.map(({ id, file, previewUrl }) => ({ id, file, previewUrl }));
    const newItems: MediaItem[] = preparedUploads.map((upload) => ({
      id: `media-${crypto.randomUUID()}`,
      src: `pending:${upload.id}`,
      alt: upload.alt,
      type: "image",
    }));

    setPendingUploads((current) => [...current, ...newUploads]);
    setDraft((current) =>
      key === "historyMedia"
        ? { ...current, historyMedia: [...current.historyMedia, ...newItems] }
        : { ...current, onTheMatMedia: [...current.onTheMatMedia, ...newItems] },
    );

    if (newItems.length === files.length) {
      setPublishStatus("idle");
      setPublishMessage("");
    } else {
      setPublishStatus("error");
      setPublishMessage(`Added ${newItems.length} photo${newItems.length === 1 ? "" : "s"}. Publish these first, then add more.`);
    }
  };

  const deleteGalleryPhoto = (key: "historyMedia" | "onTheMatMedia", id: string) => {
    const removed = draft[key].find((item) => item.id === id);

    if (removed) {
      removePendingUpload(removed.src);
    }

    setDraft((current) =>
      key === "historyMedia"
        ? { ...current, historyMedia: current.historyMedia.filter((item) => item.id !== id) }
        : { ...current, onTheMatMedia: current.onTheMatMedia.filter((item) => item.id !== id) },
    );
  };

  const addPassedStudents = async (fileEvent: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(fileEvent.target.files ?? []);
    fileEvent.target.value = "";

    if (files.length === 0) {
      return;
    }

    const availableSlots = MAX_FILES - pendingUploads.length;

    if (availableSlots <= 0) {
      setPublishStatus("error");
      setPublishMessage(`You can add at most ${MAX_FILES} new photos per publish. Publish these first, then add more.`);
      return;
    }

    const filesToPrepare = files.slice(0, availableSlots);

    for (const file of filesToPrepare) {
      const error = validateImageFile(file);

      if (error) {
        setPublishStatus("error");
        setPublishMessage(error);
        return;
      }

    }

    setPublishStatus("saving");
    setPublishMessage("Preparing images as WebP...");

    let preparedUploads: Array<PendingUpload & { alt: string }> = [];

    try {
      preparedUploads = [];

      for (const file of filesToPrepare) {
        preparedUploads.push(await prepareImageUpload(file));
      }
    } catch (conversionError) {
      preparedUploads.forEach((upload) => URL.revokeObjectURL(upload.previewUrl));
      setPublishStatus("error");
      setPublishMessage(conversionError instanceof Error ? conversionError.message : "Image conversion failed.");
      return;
    }

    if (preparedUploads.length === 0) {
      return;
    }

    const newUploads: PendingUpload[] = preparedUploads.map(({ id, file, previewUrl }) => ({ id, file, previewUrl }));
    const newStudents: PassedTestStudent[] = preparedUploads.map((upload) => ({
      id: `student-${crypto.randomUUID()}`,
      image: `pending:${upload.id}`,
      alt: upload.alt,
      dateAdded: new Date().toISOString().slice(0, 10),
      objectPosition: "center",
    }));

    setPendingUploads((current) => [...current, ...newUploads]);
    setDraft((current) => ({ ...current, passedTestStudents: [...current.passedTestStudents, ...newStudents] }));

    if (newStudents.length === files.length) {
      setPublishStatus("idle");
      setPublishMessage("");
    } else {
      setPublishStatus("error");
      setPublishMessage(`Added ${newStudents.length} photo${newStudents.length === 1 ? "" : "s"}. Publish these first, then add more.`);
    }
  };

  const deletePassedStudent = (id: string) => {
    const removed = draft.passedTestStudents.find((student) => student.id === id);

    if (removed) {
      removePendingUpload(removed.image);
    }

    setDraft((current) => ({
      ...current,
      passedTestStudents: current.passedTestStudents.filter((student) => student.id !== id),
    }));
  };

  const publish = async () => {
    setPublishStatus("saving");
    setPublishMessage("Saving content to Cloudflare...");
    setWarnings([]);

    const contentToPublish = {
      ...draft,
      version: 1,
      lastPublishedAt: new Date().toISOString(),
      recentEvents: draft.recentEvents.map((event) => ({
        ...event,
        slug: event.slug || slugify(event.title),
        notifySubscribers: event.notifySubscribers === true,
        showInCommunityCalendar: event.showInCommunityCalendar === true,
        newsletter: event.newsletter ?? {
          status: "not_sent" as const,
          sentAt: null,
          brevoCampaignId: null,
          error: null,
        },
      })),
    };

    const formData = new FormData();
    formData.append("content", JSON.stringify(contentToPublish));
    for (const upload of pendingUploads) {
      formData.append("files", upload.file, `${upload.id}-${upload.file.name}`);
    }

    try {
      const response = await fetch("/api/admin/publish", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const result = (await response.json()) as PublishResult;

      if (!response.ok || result.ok === false) {
        throw new Error(result.error || "Publish failed.");
      }

      const nextContent = result.content ?? contentToPublish;
      pendingUploads.forEach((upload) => URL.revokeObjectURL(upload.previewUrl));
      setPendingUploads([]);
      setDraft(nextContent);
      setBaseline(nextContent);
      setConfirmOpen(false);
      setWarnings(result.warnings ?? []);
      setPublishStatus(result.warnings?.length ? "error" : "success");
      setPublishMessage(result.warnings?.length ? "Saved with warnings." : "Content saved.");
    } catch (error) {
      setPublishStatus("error");
      setPublishMessage(error instanceof Error ? error.message : "Publish failed.");
    }
  };

  if (!sessionChecked) {
    return <section className="container-shell py-20" aria-live="polite" />;
  }

  if (!isAuthed) {
    return (
      <section className="container-shell py-20">
        <div className="mx-auto max-w-xl rounded-[2rem] bg-paper/80 p-8 shadow-line ring-1 ring-ink/10 sm:p-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-paper">
            <Lock size={24} aria-hidden="true" />
          </div>
          <p className="eyebrow mt-7">Admin</p>
          <h1 className="mt-3 text-3xl leading-tight text-ink sm:text-4xl">RenShinKan publishing</h1>
          <p className="mt-4 text-sm leading-6 text-charcoal/72">
            Sign in to edit site content and save it through the Cloudflare admin API.
          </p>
          <form onSubmit={login} className="mt-7">
            <label className="text-sm font-bold text-ink" htmlFor="admin-password">
              Password
            </label>
            <input
              id="admin-password"
              className="input-field"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
            {authError ? <p className="mt-3 text-sm font-bold text-vermilion">{authError}</p> : null}
            <button type="submit" className="btn-primary mt-5 w-full">
              Enter publishing mode
            </button>
          </form>
        </div>
      </section>
    );
  }

  const renderMediaGallery = (key: "historyMedia" | "onTheMatMedia", title: string, copy: string) => {
    const items = draft[key];

    return (
      <CollapsibleEditorSection
        title={title}
        copy={copy}
        summary={`${items.length} photo${items.length === 1 ? "" : "s"}`}
        open={openSections[key]}
        onToggle={() => toggleSection(key)}
      >
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <label className="btn-secondary cursor-pointer">
            <ImagePlus size={17} aria-hidden="true" />
            Add photos
            <input
              className="hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(fileEvent) => addGalleryPhotos(key, fileEvent)}
            />
          </label>
          <p className="text-sm text-charcoal/65">
            {items.length} photo{items.length === 1 ? "" : "s"}
          </p>
        </div>

        {items.length === 0 ? (
          <p className="rounded-[1.5rem] bg-paper/60 p-5 text-sm leading-6 text-charcoal/72 ring-1 ring-ink/10">
            No photos yet. Use "Add photos" to upload.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <li key={item.id} className="relative overflow-hidden rounded-[1.25rem] ring-1 ring-ink/10">
                <div className="aspect-[4/3] bg-ink/5">
                  <img src={resolveSrc(item.src)} alt={item.alt || ""} className="h-full w-full object-cover" loading="lazy" />
                </div>
                {item.src.startsWith("pending:") ? (
                  <span className="absolute left-2 top-2 rounded-full bg-bamboo px-2 py-0.5 text-xs font-bold text-paper">New</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => deleteGalleryPhoto(key, item.id)}
                  className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-ink/80 text-paper transition hover:bg-vermilion focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper"
                  aria-label={`Delete photo ${item.alt || item.id}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleEditorSection>
    );
  };

  return (
    <section className="container-shell py-12 sm:py-16">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="section-title">Dojo content editor</h1>
          <p className="section-copy">
            Edit recent events, manage the photo galleries, and save the public content stored on Cloudflare.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={logout} className="btn-secondary">
            <LogOut size={17} aria-hidden="true" />
            Log out
          </button>
          <button type="button" onClick={() => setConfirmOpen(true)} className="btn-primary">
            <Save size={18} aria-hidden="true" />
            Review Publish
          </button>
        </div>
      </div>

      {publishMessage ? (
        <div
          className={`mb-8 rounded-[1.5rem] p-5 ring-1 ${
            publishStatus === "error"
              ? "bg-vermilion/10 text-vermilion ring-vermilion/20"
              : "bg-bamboo/10 text-bamboo ring-bamboo/20"
          }`}
        >
          <div className="flex items-center gap-3 text-sm font-bold">
            {publishStatus === "saving" ? (
              <RefreshCw className="animate-spin" size={18} aria-hidden="true" />
            ) : publishStatus === "error" ? (
              <AlertCircle size={18} aria-hidden="true" />
            ) : (
              <CheckCircle size={18} aria-hidden="true" />
            )}
            {publishMessage}
          </div>
          {warnings.length ? (
            <ul className="mt-3 grid gap-1 text-sm">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-8">
        <CollapsibleEditorSection
          title="Recent Events"
          copy="Create and edit public dojo updates. Published events appear on the Recent Events page."
          summary={`${draft.recentEvents.length} event${draft.recentEvents.length === 1 ? "" : "s"}`}
          open={openSections.recentEvents}
          onToggle={() => toggleSection("recentEvents")}
        >
          <button type="button" className="btn-secondary mb-6" onClick={addEvent}>
            <Plus size={17} aria-hidden="true" />
            Add Recent Event
          </button>

          <div className="grid gap-6">
            {draft.recentEvents.length === 0 ? (
              <p className="rounded-[1.5rem] bg-paper/60 p-5 text-sm leading-6 text-charcoal/72 ring-1 ring-ink/10">
                No recent events yet.
              </p>
            ) : null}

            {draft.recentEvents.map((event) => {
              const eventOpen = openEventIds.includes(event.id);
              const mediaPreview = previewMedia(event);
              const paragraphCount = splitEventBodyParagraphs(event.body).length;
              const photoCount = eventPhotoCount(event);
              const documentCount = eventDocumentCount(event);

              return (
              <article key={event.id} className="rounded-[1.5rem] bg-paper/60 p-5 ring-1 ring-ink/10">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <button
                    type="button"
                    aria-expanded={eventOpen}
                    onClick={() => toggleEvent(event.id)}
                    className="flex flex-1 items-start justify-between gap-4 text-left"
                  >
                    <span>
                      <span className="block text-xs font-bold uppercase tracking-[0.16em] text-bamboo">Recent Event</span>
                      <span className="mt-2 block text-xl leading-tight text-ink">
                        {event.title.trim() || "Untitled recent event"}
                      </span>
                      <span className="mt-2 block text-sm text-charcoal/65">
                        {event.date || "No date"} - Newsletter status: {statusLabel(event)}
                      </span>
                      <span className="mt-1 block text-sm text-charcoal/55">
                        {event.published ? "Published" : "Draft"} - {event.showInCommunityCalendar ? "Community calendar" : "Not on calendar"} - {mediaPreview.length} media item
                        {mediaPreview.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    <ChevronDown
                      size={20}
                      aria-hidden="true"
                      className={`mt-1 shrink-0 text-ink transition-transform ${eventOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  <button type="button" className="btn-secondary text-vermilion" onClick={() => deleteEvent(event.id)}>
                    <Trash2 size={16} aria-hidden="true" />
                    Delete
                  </button>
                </div>

                <div className={eventOpen ? "mt-5" : "hidden"}>
                <div className="grid gap-5 lg:grid-cols-2">
                  <label className="block text-sm font-bold text-ink">
                    Title
                    <input
                      className="input-field"
                      value={event.title}
                      onChange={(inputEvent) =>
                        updateEvent(event.id, (current) => ({
                          ...current,
                          title: inputEvent.target.value,
                          slug: current.slug || slugify(inputEvent.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="block text-sm font-bold text-ink">
                    Date
                    <input
                      className="input-field"
                      type="date"
                      value={event.date}
                      onChange={(inputEvent) =>
                        updateEvent(event.id, (current) => ({ ...current, date: inputEvent.target.value }))
                      }
                    />
                  </label>
                  <label className="block text-sm font-bold text-ink">
                    Slug
                    <input
                      className="input-field"
                      value={event.slug}
                      onChange={(inputEvent) =>
                        updateEvent(event.id, (current) => ({ ...current, slug: slugify(inputEvent.target.value) }))
                      }
                    />
                  </label>
                </div>

                <label className="mt-5 block text-sm font-bold text-ink">
                  Summary
                  <textarea
                    className="input-field min-h-28"
                    value={event.summary}
                    onChange={(inputEvent) =>
                      updateEvent(event.id, (current) => ({ ...current, summary: inputEvent.target.value }))
                    }
                  />
                </label>

                <label className="mt-5 block text-sm font-bold text-ink">
                  Body
                  <textarea
                    className="input-field min-h-52"
                    value={event.body}
                    onChange={(inputEvent) =>
                      updateEvent(event.id, (current) => ({ ...current, body: inputEvent.target.value }))
                    }
                  />
                </label>

                <div className="mt-5 rounded-lg border border-ink/10 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-base font-bold text-ink">Body media</h4>
                      <p className="mt-1 text-sm text-charcoal/70">
                        {photoCount}/{MAX_EVENT_PHOTOS} photos, {mediaPreview.filter((item) => item.type === "video").length} video
                        {mediaPreview.filter((item) => item.type === "video").length === 1 ? "" : "s"}, {documentCount} document
                        {documentCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label className="btn-secondary cursor-pointer">
                        <ImagePlus size={17} aria-hidden="true" />
                        Add photos
                        <input
                          className="hidden"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          onChange={(inputEvent) => addEventPhotos(event.id, inputEvent)}
                        />
                      </label>
                      <label className="btn-secondary cursor-pointer">
                        <FileText size={17} aria-hidden="true" />
                        Add documents
                        <input
                          className="hidden"
                          type="file"
                          accept={DOCUMENT_ACCEPT}
                          multiple
                          onChange={(inputEvent) => addEventDocuments(event.id, inputEvent)}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <label className="flex-1 text-sm font-bold text-ink">
                      Video embed
                      <input
                        className="input-field"
                        value={videoEmbedInputs[event.id] ?? ""}
                        placeholder="https://www.youtube.com/watch?v=..."
                        onChange={(inputEvent) =>
                          setVideoEmbedInputs((current) => ({ ...current, [event.id]: inputEvent.target.value }))
                        }
                      />
                    </label>
                    <button type="button" className="btn-secondary self-end" onClick={() => addEventVideo(event.id)}>
                      <Plus size={17} aria-hidden="true" />
                      Add video
                    </button>
                  </div>

                  {mediaPreview.length ? (
                    <div className="mt-5 grid gap-4">
                      {mediaPreview.map((item) => {
                        const placement = normalizeBodyMediaPlacement(item.bodyPlacement, paragraphCount);

                        return (
                          <div key={item.id} className="grid gap-4 rounded-lg border border-ink/10 p-4 lg:grid-cols-[180px_1fr]">
                            <div className="overflow-hidden rounded-md border border-ink/10 bg-ink/5">
                              {item.type === "video" ? (
                                <iframe
                                  src={normalizeEmbedUrl(item.src)}
                                  title={item.title || item.caption || "Video preview"}
                                  className="aspect-video w-full"
                                  loading="lazy"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                  allowFullScreen
                                />
                              ) : item.type === "document" ? (
                                <div className="flex aspect-video flex-col items-center justify-center gap-2 p-4 text-center text-charcoal/75">
                                  {item.documentKind === "ppt" ? (
                                    <Presentation size={28} aria-hidden="true" />
                                  ) : (
                                    <FileText size={28} aria-hidden="true" />
                                  )}
                                  <span className="text-sm font-bold text-ink">{documentKindLabel(item.documentKind)}</span>
                                  <span className="line-clamp-2 text-xs">{item.fileName || documentTitle(item)}</span>
                                </div>
                              ) : (
                                <img src={item.src} alt={item.alt || ""} className="aspect-video w-full object-cover" loading="lazy" />
                              )}
                            </div>

                            <div className="grid gap-3">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <label className="text-sm font-bold text-ink">
                                  {item.type === "image" ? "Alt text" : "Title"}
                                  <input
                                    className="input-field"
                                    value={item.type === "image" ? item.alt ?? "" : item.title ?? ""}
                                    onChange={(inputEvent) =>
                                      updateEventMediaItem(event.id, item.id, (current) => ({
                                        ...current,
                                        ...(current.type === "image"
                                          ? { alt: inputEvent.target.value }
                                          : current.type === "document"
                                            ? { title: inputEvent.target.value, alt: inputEvent.target.value }
                                            : { title: inputEvent.target.value }),
                                      }))
                                    }
                                  />
                                </label>
                                <label className="text-sm font-bold text-ink">
                                  Caption
                                  <input
                                    className="input-field"
                                    value={item.caption ?? ""}
                                    onChange={(inputEvent) =>
                                      updateEventMediaItem(event.id, item.id, (current) => ({
                                        ...current,
                                        caption: inputEvent.target.value,
                                      }))
                                    }
                                  />
                                </label>
                              </div>

                              {item.type === "document" ? (
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <label className="text-sm font-bold text-ink">
                                    Display
                                    <select
                                      className="input-field"
                                      value={item.displayMode ?? "inline"}
                                      onChange={(inputEvent) =>
                                        updateEventMediaItem(event.id, item.id, (current) => ({
                                          ...current,
                                          displayMode: inputEvent.target.value as "inline" | "link",
                                        }))
                                      }
                                    >
                                      <option value="inline">Inline viewer</option>
                                      <option value="link">Link card</option>
                                    </select>
                                  </label>
                                  <div className="text-sm font-bold text-ink">
                                    File
                                    <p className="input-field min-h-11 text-sm font-normal text-charcoal/75">
                                      {[documentKindLabel(item.documentKind), formatFileSize(item.fileSize)].filter(Boolean).join(" - ")}
                                    </p>
                                  </div>
                                </div>
                              ) : null}

                              <div className="grid gap-3 sm:grid-cols-3">
                                <label className="text-sm font-bold text-ink">
                                  Position
                                  <select
                                    className="input-field"
                                    value={placement.position}
                                    onChange={(inputEvent) =>
                                      updateEventMediaPlacement(event.id, item.id, paragraphCount, {
                                        position: Number(inputEvent.target.value),
                                      })
                                    }
                                  >
                                    {Array.from({ length: paragraphCount + 1 }, (_, position) => (
                                      <option key={position} value={position}>
                                        {bodyPositionLabel(position, paragraphCount)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="text-sm font-bold text-ink">
                                  Align
                                  <select
                                    className="input-field"
                                    value={placement.align}
                                    onChange={(inputEvent) =>
                                      updateEventMediaPlacement(event.id, item.id, paragraphCount, {
                                        align: inputEvent.target.value as "left" | "center" | "right",
                                      })
                                    }
                                  >
                                    <option value="left">Left</option>
                                    <option value="center">Center</option>
                                    <option value="right">Right</option>
                                  </select>
                                </label>
                                <label className="text-sm font-bold text-ink">
                                  Width {placement.widthPercent}%
                                  <input
                                    className="mt-4 w-full"
                                    type="range"
                                    min="25"
                                    max="100"
                                    step="5"
                                    value={placement.widthPercent}
                                    onChange={(inputEvent) =>
                                      updateEventMediaPlacement(event.id, item.id, paragraphCount, {
                                        widthPercent: Number(inputEvent.target.value),
                                      })
                                    }
                                  />
                                </label>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  disabled={placement.position === 0}
                                  onClick={() =>
                                    updateEventMediaPlacement(event.id, item.id, paragraphCount, {
                                      position: placement.position - 1,
                                    })
                                  }
                                >
                                  Move up
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  disabled={placement.position >= paragraphCount}
                                  onClick={() =>
                                    updateEventMediaPlacement(event.id, item.id, paragraphCount, {
                                      position: placement.position + 1,
                                    })
                                  }
                                >
                                  Move down
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary text-vermilion"
                                  onClick={() => deleteEventMedia(event.id, item.id)}
                                >
                                  <Trash2 size={16} aria-hidden="true" />
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-lg border border-ink/10 bg-paper/60 p-4 text-sm text-charcoal/70">
                      No media added to this event.
                    </p>
                  )}

                  <div className="mt-6 border-t border-ink/10 pt-5">
                    <h4 className="text-base font-bold text-ink">Body preview</h4>
                    <EventBodyRenderer
                      body={event.body}
                      media={mediaPreview}
                      fallbackTitle={event.title || "Recent event"}
                      className="mt-3 rounded-lg border border-ink/10 bg-white p-4"
                    />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-4">
                  <label className="inline-flex items-center gap-2 text-sm font-bold text-ink">
                    <input
                      type="checkbox"
                      checked={event.published}
                      onChange={(inputEvent) =>
                        updateEvent(event.id, (current) => ({ ...current, published: inputEvent.target.checked }))
                      }
                    />
                    Published
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm font-bold text-ink">
                    <input
                      type="checkbox"
                      checked={event.notifySubscribers === true}
                      onChange={(inputEvent) =>
                        updateEvent(event.id, (current) => ({ ...current, notifySubscribers: inputEvent.target.checked }))
                      }
                    />
                    Notify subscribers
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm font-bold text-ink">
                    <input
                      type="checkbox"
                      checked={event.showInCommunityCalendar === true}
                      onChange={(inputEvent) =>
                        updateEvent(event.id, (current) => ({ ...current, showInCommunityCalendar: inputEvent.target.checked }))
                      }
                    />
                    Community calendar
                  </label>
                </div>
                </div>
              </article>
              );
            })}
          </div>
        </CollapsibleEditorSection>

        {renderMediaGallery(
          "onTheMatMedia",
          "On the Mat",
          "Add or remove photos in the \"On the Mat\" gallery shown on the Dojo page.",
        )}

        {renderMediaGallery(
          "historyMedia",
          "A Look at Our History",
          "Add or remove photos in the \"A Look at Our History\" gallery shown on the Community page.",
        )}

        <CollapsibleEditorSection
          title="Students Who've Passed the Test"
          copy="Add or remove photos in the graduation gallery shown on the Classes page."
          summary={`${draft.passedTestStudents.length} photo${draft.passedTestStudents.length === 1 ? "" : "s"}`}
          open={openSections.passedTestStudents}
          onToggle={() => toggleSection("passedTestStudents")}
        >
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <label className="btn-secondary cursor-pointer">
              <ImagePlus size={17} aria-hidden="true" />
              Add photos
              <input
                className="hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={addPassedStudents}
              />
            </label>
            <p className="text-sm text-charcoal/65">
              {draft.passedTestStudents.length} photo{draft.passedTestStudents.length === 1 ? "" : "s"}
            </p>
          </div>

          {draft.passedTestStudents.length === 0 ? (
            <p className="rounded-[1.5rem] bg-paper/60 p-5 text-sm leading-6 text-charcoal/72 ring-1 ring-ink/10">
              No photos yet. Use "Add photos" to upload.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {draft.passedTestStudents.map((student) => (
                <li key={student.id} className="relative overflow-hidden rounded-[1.25rem] ring-1 ring-ink/10">
                  <div className="aspect-[4/3] bg-ink/5">
                    <img
                      src={resolveSrc(student.image)}
                      alt={student.alt || student.name || ""}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  {student.image.startsWith("pending:") ? (
                    <span className="absolute left-2 top-2 rounded-full bg-bamboo px-2 py-0.5 text-xs font-bold text-paper">New</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => deletePassedStudent(student.id)}
                    className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-ink/80 text-paper transition hover:bg-vermilion focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper"
                    aria-label={`Delete photo ${student.alt || student.name || student.id}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CollapsibleEditorSection>

        <section className="surface rounded-[2rem] p-6 sm:p-8">
          {sectionTitle("Exam Announcement", "Optional text shown in the classes and belt exams section after publishing.")}
          <input
            className="input-field"
            value={draft.examAnnouncement?.text ?? ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                examAnnouncement: {
                  text: event.target.value,
                  updatedAt: new Date().toISOString(),
                },
              }))
            }
          />
        </section>

        <section className="surface rounded-[2rem] p-6 sm:p-8">
          {sectionTitle("Save / Publish Changes", "Review the publish summary before the server updates Cloudflare storage.")}
          <button type="button" onClick={() => setConfirmOpen(true)} className="btn-primary">
            <Save size={18} aria-hidden="true" />
            Review Publish
          </button>
        </section>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-5">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-[2rem] bg-paper p-6 shadow-soft sm:p-7">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="eyebrow">Confirm Publish</p>
                <h2 className="mt-3 text-3xl text-ink">Publish these changes?</h2>
              </div>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10"
                onClick={() => setConfirmOpen(false)}
                aria-label="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <dl className="mt-6 grid gap-3 text-sm text-charcoal/75">
              <div className="flex justify-between gap-4">
                <dt>Recent Events changed</dt>
                <dd className="font-bold text-ink">{changedEvents.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Gallery photos</dt>
                <dd className="font-bold text-ink">{galleriesChanged ? "Edited" : "No change"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Files uploaded</dt>
                <dd className="font-bold text-ink">{pendingUploads.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Subscribers emailed</dt>
                <dd className="font-bold text-ink">{emailEvents.length > 0 ? "Yes" : "No"}</dd>
              </div>
            </dl>

            {emailEvents.length > 0 ? (
              <div className="mt-5 rounded-[1.25rem] bg-vermilion/10 p-4 ring-1 ring-vermilion/20">
                <p className="text-sm font-bold text-vermilion">These events will trigger Brevo campaigns:</p>
                <ul className="mt-2 grid gap-1 text-sm text-charcoal/75">
                  {emailEvents.map((event) => (
                    <li key={event.id}>{event.title || event.slug || event.id}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button type="button" className="btn-primary" onClick={publish} disabled={publishStatus === "saving"}>
                <Save size={18} aria-hidden="true" />
                Publish Now
              </button>
              <button type="button" className="btn-secondary" onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
