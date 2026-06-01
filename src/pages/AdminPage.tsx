import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ImagePlus,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { MediaSlider } from "../components/MediaSlider";
import {
  historyMedia as defaultHistoryMedia,
  onTheMatMedia as defaultOnTheMatMedia,
  passedTestStudents as defaultPassedTestStudents,
} from "../data/editableContent";
import { emptyEditableContent, loadEditableContent } from "../lib/content";
import type { EditableContent, MediaItem, PassedTestStudent, RecentEvent } from "../types/editableContent";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 10;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

  if (file.size > MAX_FILE_SIZE) {
    return "Images must be 5 MB or smaller.";
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
  const [openSections, setOpenSections] = useState<Record<AdminSectionId, boolean>>({
    recentEvents: false,
    onTheMatMedia: false,
    historyMedia: false,
    passedTestStudents: false,
  });
  const [openEventIds, setOpenEventIds] = useState<string[]>([]);

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
    setDraft((current) => ({
      ...current,
      recentEvents: current.recentEvents.filter((event) => event.id !== id),
    }));
  };

  const changeImage = (eventId: string, fileEvent: ChangeEvent<HTMLInputElement>) => {
    const file = fileEvent.target.files?.[0];
    fileEvent.target.value = "";

    if (!file) {
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setPublishStatus("error");
      setPublishMessage("Images must be JPEG, PNG, or WebP.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setPublishStatus("error");
      setPublishMessage("Images must be 5 MB or smaller.");
      return;
    }

    if (pendingUploads.length >= MAX_FILES) {
      setPublishStatus("error");
      setPublishMessage("You can upload at most 10 files in one publish.");
      return;
    }

    const uploadId = `upload-${crypto.randomUUID()}`;
    const mediaItem: MediaItem = {
      id: `media-${crypto.randomUUID()}`,
      src: `pending:${uploadId}`,
      alt: file.name.replace(/\.[^.]+$/, ""),
      type: "image",
    };

    setPendingUploads((current) => [
      ...current,
      {
        id: uploadId,
        file,
        previewUrl: URL.createObjectURL(file),
      },
    ]);
    updateEvent(eventId, (current) => ({
      ...current,
      image: mediaItem,
      media: [mediaItem],
    }));
    setPublishStatus("idle");
    setPublishMessage("");
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

  const addGalleryPhotos = (key: "historyMedia" | "onTheMatMedia", fileEvent: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(fileEvent.target.files ?? []);
    fileEvent.target.value = "";

    if (files.length === 0) {
      return;
    }

    const newUploads: PendingUpload[] = [];
    const newItems: MediaItem[] = [];

    for (const file of files) {
      const error = validateImageFile(file);

      if (error) {
        setPublishStatus("error");
        setPublishMessage(error);
        return;
      }

      if (pendingUploads.length + newUploads.length >= MAX_FILES) {
        setPublishStatus("error");
        setPublishMessage(`You can add at most ${MAX_FILES} new photos per publish. Publish these first, then add more.`);
        break;
      }

      const uploadId = `upload-${crypto.randomUUID()}`;
      newUploads.push({ id: uploadId, file, previewUrl: URL.createObjectURL(file) });
      newItems.push({
        id: `media-${crypto.randomUUID()}`,
        src: `pending:${uploadId}`,
        alt: file.name.replace(/\.[^.]+$/, ""),
        type: "image",
      });
    }

    if (newItems.length === 0) {
      return;
    }

    setPendingUploads((current) => [...current, ...newUploads]);
    setDraft((current) =>
      key === "historyMedia"
        ? { ...current, historyMedia: [...current.historyMedia, ...newItems] }
        : { ...current, onTheMatMedia: [...current.onTheMatMedia, ...newItems] },
    );

    if (newItems.length === files.length) {
      setPublishStatus("idle");
      setPublishMessage("");
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

  const addPassedStudents = (fileEvent: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(fileEvent.target.files ?? []);
    fileEvent.target.value = "";

    if (files.length === 0) {
      return;
    }

    const newUploads: PendingUpload[] = [];
    const newStudents: PassedTestStudent[] = [];

    for (const file of files) {
      const error = validateImageFile(file);

      if (error) {
        setPublishStatus("error");
        setPublishMessage(error);
        return;
      }

      if (pendingUploads.length + newUploads.length >= MAX_FILES) {
        setPublishStatus("error");
        setPublishMessage(`You can add at most ${MAX_FILES} new photos per publish. Publish these first, then add more.`);
        break;
      }

      const uploadId = `upload-${crypto.randomUUID()}`;
      newUploads.push({ id: uploadId, file, previewUrl: URL.createObjectURL(file) });
      newStudents.push({
        id: `student-${crypto.randomUUID()}`,
        image: `pending:${uploadId}`,
        alt: file.name.replace(/\.[^.]+$/, ""),
        dateAdded: new Date().toISOString().slice(0, 10),
        objectPosition: "center",
      });
    }

    if (newStudents.length === 0) {
      return;
    }

    setPendingUploads((current) => [...current, ...newUploads]);
    setDraft((current) => ({ ...current, passedTestStudents: [...current.passedTestStudents, ...newStudents] }));

    if (newStudents.length === files.length) {
      setPublishStatus("idle");
      setPublishMessage("");
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
          <h1 className="mt-3 text-3xl leading-tight text-ink sm:text-4xl">RenshinKan publishing</h1>
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
            No photos yet. Use “Add photos” to upload.
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

      <div className="mb-8 rounded-[1.5rem] bg-bamboo/10 p-5 ring-1 ring-bamboo/20">
        <div className="flex gap-3">
          <UploadCloud className="mt-1 shrink-0 text-bamboo" size={20} aria-hidden="true" />
          <p className="text-sm leading-6 text-charcoal/78">
            Publishing uses an HttpOnly admin session and server-side Cloudflare Pages Functions. Storage and Brevo
            credentials are never sent to the browser.
          </p>
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
                        {event.date || "No date"} · Newsletter status: {statusLabel(event)}
                      </span>
                      <span className="mt-1 block text-sm text-charcoal/55">
                        {event.published ? "Published" : "Draft"} · {mediaPreview.length} media item
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
                  <label className="block text-sm font-bold text-ink">
                    Image alt text
                    <input
                      className="input-field"
                      value={event.image?.alt ?? ""}
                      onChange={(inputEvent) => {
                        const alt = inputEvent.target.value;
                        updateEvent(event.id, (current) => ({
                          ...current,
                          image: current.image ? { ...current.image, alt } : current.image,
                          media: current.media?.map((item) => (item.id === current.image?.id ? { ...item, alt } : item)),
                        }));
                      }}
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

                <div className="mt-5 flex flex-wrap gap-4">
                  <label className="btn-secondary cursor-pointer">
                    <ImagePlus size={17} aria-hidden="true" />
                    Upload image
                    <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(inputEvent) => changeImage(event.id, inputEvent)} />
                  </label>
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
                </div>

                {mediaPreview.length ? (
                  <MediaSlider media={mediaPreview} label={`${event.title || "Recent event"} media preview`} className="mt-6" />
                ) : null}
                </div>
              </article>
              );
            })}
          </div>
        </CollapsibleEditorSection>

        {renderMediaGallery(
          "onTheMatMedia",
          "On the Mat",
          "Add or remove photos in the “On the Mat” gallery shown on the Dojo page.",
        )}

        {renderMediaGallery(
          "historyMedia",
          "A Look at Our History",
          "Add or remove photos in the “A Look at Our History” gallery shown on the Community page.",
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
              No photos yet. Use “Add photos” to upload.
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
