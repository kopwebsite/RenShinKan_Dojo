import {
  AlertCircle,
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  ImagePlus,
  Inbox,
  Laptop,
  LoaderCircle,
  Mail,
  MoreHorizontal,
  Paperclip,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  Smartphone,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  lazy,
  Suspense,
  type ChangeEvent,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  NEWSLETTER_CATEGORIES,
  collectNewsletterDocumentText,
  newsletterCover,
  newsletterPublicationIssues,
  type NewsletterContentType,
  type NewsletterDocument,
  type NewsletterFormat,
} from "../../../shared/newsletter";
import { EventBodyRenderer } from "../EventBodyRenderer";
import { NewsletterDocumentRenderer } from "../NewsletterDocumentRenderer";
import { ResponsiveImage } from "../ResponsiveImage";
import type {
  EditableContent,
  MediaItem,
  RecentEvent,
} from "../../types/editableContent";
import { documentKindLabel, formatFileSize } from "../../utils/documentMedia";
import { isValidEmbedUrl, normalizeEmbedUrl } from "../../utils/mediaEmbeds";
import {
  GregorianDateInput,
  GregorianDateTimeInput,
} from "../GregorianDateInput";
import { formatGregorianDate } from "../../../shared/date";
import "../../newsletter.css";

const ADMIN_PAGE_SIZE = 20;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024;
const MAX_EVENT_PHOTOS = 6;
const MAX_PENDING_FILES = 10;
const LOCAL_BACKUP_PREFIX = "renshinkan-newsletter-draft:";
const FALLBACK_COVER = "/dojo-photos/aikido-hero-new.webp";
const NewsletterRichEditor = lazy(() =>
  import("./NewsletterRichEditor").then((module) => ({
    default: module.NewsletterRichEditor,
  })),
);

function plainTextNewsletterDocument(body: string): NewsletterDocument {
  return {
    type: "doc",
    content: (body || "")
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((text) => ({
        type: "paragraph",
        attrs: { variant: "default" },
        content: [{ type: "text", text }],
      })),
  };
}
const SECTION_LABELS = [
  "Basic information",
  "Choose format",
  "Create content",
  "Choose where it appears",
  "Review and publish",
] as const;

type SaveState = "saved" | "saving" | "unsaved" | "error";
type PendingUpload = { id: string; file: File; previewUrl: string };
type DeliveryStatus = {
  configured: boolean;
  recipientCount: number | null;
  senderName: string;
  replyTo: string;
  warning?: string;
};

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);
}

function makeNewsletter(contentType: NewsletterContentType): RecentEvent {
  const now = new Date().toISOString();
  return {
    id: `event-${crypto.randomUUID()}`,
    title: "",
    date: now.slice(0, 10),
    summary: "",
    body: "",
    bodyContent: {
      type: "doc",
      content: [{ type: "paragraph", attrs: { variant: "default" } }],
    },
    slug: "",
    slugHistory: [],
    published: false,
    websitePublishRequested: false,
    publishedAt: null,
    publishAt: null,
    contentType,
    category: contentType === "event" ? "Events" : "Dojo News",
    tags: [],
    lifecycleStatus: "active",
    presentation: {
      originalMediaId: null,
      pdfMediaId: null,
      viewerTitle: "",
      slideCount: null,
      outline: [],
    },
    archivedAt: null,
    trashedAt: null,
    featured: false,
    coverImageId: null,
    relatedNewsletterIds: [],
    emailSettings: {
      subject: "",
      previewText: "",
      senderName: "RenShinKan Dojo",
      replyTo: "",
    },
    eventDetails: {
      startAt: contentType === "event" ? `${now.slice(0, 10)}T18:00` : "",
      endAt: "",
      location: "",
      registrationUrl: "",
    },
    image: undefined,
    media: [],
    notifySubscribers: false,
    showInCommunityCalendar: false,
    calendar: { status: "not_added", publishedAt: null, error: null },
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

function eventSnapshot(event: RecentEvent) {
  const { updatedAt: _updatedAt, ...snapshot } = event;
  return JSON.stringify(snapshot);
}

function isEmptyDraft(event: RecentEvent) {
  return (
    !event.title.trim() &&
    !event.summary.trim() &&
    !event.body.trim() &&
    !event.media?.length
  );
}

function dateLabel(value: string) {
  return formatGregorianDate(value, "No date");
}

function replaceEvent(content: EditableContent, event: RecentEvent) {
  const exists = content.recentEvents.some((item) => item.id === event.id);
  return {
    ...content,
    recentEvents: exists
      ? content.recentEvents.map((item) =>
          item.id === event.id ? event : item,
        )
      : [event, ...content.recentEvents],
  };
}

function removeEvent(content: EditableContent, id: string) {
  return {
    ...content,
    recentEvents: content.recentEvents.filter((event) => event.id !== id),
  };
}

function statusFor(event: RecentEvent) {
  if (event.lifecycleStatus === "trash") return "Trash";
  if (event.lifecycleStatus === "archived") return "Archived";
  if (event.newsletter?.status === "sent") return "Sent to subscribers";
  if (event.published) return "Published on website";
  if (event.contentType === "event") return "Event";
  if (newsletterPublicationIssues(event).length === 0)
    return "Ready to publish";
  return "Draft";
}

function statusTone(event: RecentEvent) {
  const status = statusFor(event);
  if (status === "Sent to subscribers" || status === "Published on website")
    return "success";
  if (status === "Ready to publish") return "ready";
  if (status === "Trash" || status === "Archived") return "muted";
  return "draft";
}

function emailLabel(event: RecentEvent) {
  if (event.newsletter?.status === "sent") return "Email sent";
  if (event.newsletter?.status === "pending") return "Email sending";
  if (event.newsletter?.status === "failed") return "Email needs attention";
  return event.notifySubscribers ? "Email selected" : "Email not selected";
}

function websiteLabel(event: RecentEvent) {
  return event.published
    ? "Website published"
    : event.websitePublishRequested
      ? "Website selected"
      : "Website draft";
}

function documentKind(file: File) {
  const extension = file.name.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase();
  if (file.type === "application/pdf" || extension === ".pdf")
    return "pdf" as const;
  if (file.type.includes("wordprocessingml") || extension === ".docx")
    return "docx" as const;
  if (
    file.type.includes("presentation") ||
    extension === ".ppt" ||
    extension === ".pptx"
  )
    return "ppt" as const;
  return null;
}

function loadImage(file: File) {
  return createImageBitmap(file);
}

async function convertImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size > MAX_IMAGE_SIZE)
    throw new Error("Images must be 5 MB or smaller.");
  const image = await loadImage(file);
  const scale = Math.min(1, 1920 / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("Image conversion failed.")),
      "image/webp",
      0.86,
    ),
  );
  return new File(
    [blob],
    `${file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "image"}.webp`,
    {
      type: "image/webp",
      lastModified: Date.now(),
    },
  );
}

function previewMedia(event: RecentEvent, pending: PendingUpload[]) {
  const byId = new Map(pending.map((upload) => [upload.id, upload.previewUrl]));
  return (event.media ?? []).map((item) =>
    item.src.startsWith("pending:")
      ? {
          ...item,
          src: byId.get(item.src.slice("pending:".length)) || item.src,
        }
      : item,
  );
}

function AdminStatusPill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className="admin-newsletter-status" data-tone={tone}>
      {children}
    </span>
  );
}

function PreviewDialog({
  event,
  mode,
  onClose,
}: {
  event: RecentEvent;
  mode: "web" | "email";
  onClose: () => void;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const cover = newsletterCover(event);
  const media = (event.media ?? []).filter(
    (item) => item.id !== event.coverImageId,
  );
  return (
    <div className="admin-newsletter-dialog-backdrop">
      <section
        className="admin-newsletter-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="newsletter-preview-title"
        tabIndex={-1}
      >
        <header>
          <div>
            <p className="eyebrow">
              {mode === "web" ? "Website preview" : "Subscriber email preview"}
            </p>
            <h2 id="newsletter-preview-title">
              {event.title || "Untitled draft"}
            </h2>
          </div>
          <div className="admin-newsletter-preview-dialog__tools">
            <button
              type="button"
              aria-pressed={device === "desktop"}
              onClick={() => setDevice("desktop")}
            >
              <Laptop size={18} /> Desktop
            </button>
            <button
              type="button"
              aria-pressed={device === "mobile"}
              onClick={() => setDevice("mobile")}
            >
              <Smartphone size={18} /> Mobile
            </button>
            <button type="button" aria-label="Close preview" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </header>
        <div
          className="admin-newsletter-preview-stage"
          data-device={device}
          data-mode={mode}
        >
          <article>
            {mode === "email" ? (
              <p className="admin-newsletter-email-masthead">
                RenShinKan Dojo · Notes from the mat
              </p>
            ) : null}
            <p className="journal-entry__category">
              {event.category || "Dojo News"} · {dateLabel(event.date)}
            </p>
            <h1>{event.title || "Untitled draft"}</h1>
            <p className="journal-entry__dek">
              {event.summary || "The short summary will appear here."}
            </p>
            {cover ? <img src={cover.src} alt={cover.alt || ""} /> : null}
            {event.bodyContent ? (
              <NewsletterDocumentRenderer document={event.bodyContent} />
            ) : (
              <EventBodyRenderer
                body={event.body}
                media={event.media}
                fallbackTitle={event.title}
              />
            )}
            {event.bodyContent && media.length ? (
              <EventBodyRenderer
                body=""
                media={media}
                fallbackTitle={event.title}
              />
            ) : null}
          </article>
        </div>
      </section>
    </div>
  );
}

export function AdminNewsletterManager({
  draft,
  baseline,
  setDraft,
  setBaseline,
}: {
  draft: EditableContent;
  baseline: EditableContent;
  setDraft: Dispatch<SetStateAction<EditableContent>>;
  setBaseline: Dispatch<SetStateAction<EditableContent>>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorEvent, setEditorEvent] = useState<RecentEvent | null>(null);
  const editorRef = useRef<RecentEvent | null>(null);
  const expectedUpdatedAtRef = useRef("");
  const lastSavedSnapshotRef = useRef("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveMessage, setSaveMessage] = useState("Saved");
  const [activeSection, setActiveSection] = useState(0);
  const [visitedSections, setVisitedSections] = useState<Set<number>>(new Set());
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [sort, setSort] = useState("edited-desc");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [creationOpen, setCreationOpen] = useState(false);
  const [emptyDraftCandidate, setEmptyDraftCandidate] =
    useState<RecentEvent | null>(null);
  const [recoveryDraft, setRecoveryDraft] = useState<RecentEvent | null>(null);
  const [previewMode, setPreviewMode] = useState<"web" | "email" | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>({
    configured: false,
    recipientCount: null,
    senderName: "RenShinKan Dojo",
    replyTo: "",
  });
  const [sendConfirmationOpen, setSendConfirmationOpen] = useState(false);
  const [sendIdempotencyKey, setSendIdempotencyKey] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testConfirmed, setTestConfirmed] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [errorSummary, setErrorSummary] = useState<string[]>([]);
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);
  const dialogIsOpen = Boolean(
    previewMode || sendConfirmationOpen || creationOpen || emptyDraftCandidate,
  );

  useEffect(() => {
    fetch("/api/admin/newsletters/status", {
      credentials: "include",
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((result) => {
        if (result.ok)
          setDeliveryStatus({
            configured: result.configured === true,
            recipientCount:
              typeof result.recipientCount === "number"
                ? result.recipientCount
                : null,
            senderName:
              typeof result.senderName === "string"
                ? result.senderName
                : "RenShinKan Dojo",
            replyTo: typeof result.replyTo === "string" ? result.replyTo : "",
            warning:
              typeof result.warning === "string" ? result.warning : undefined,
          });
      })
      .catch(() =>
        setDeliveryStatus((current) => ({
          ...current,
          warning: "Subscriber details are unavailable.",
        })),
      );
  }, []);

  useEffect(() => {
    if (!dialogIsOpen) return;
    dialogReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = document.querySelector<HTMLElement>(
      ".admin-newsletter-dialog-backdrop [role='dialog']",
    );
    const focusableSelector =
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";
    window.requestAnimationFrame(() => dialog?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPreviewMode(null);
        setSendConfirmationOpen(false);
        setCreationOpen(false);
        setEmptyDraftCandidate(null);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(focusableSelector),
      ].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      dialogReturnFocusRef.current?.focus();
      dialogReturnFocusRef.current = null;
    };
  }, [dialogIsOpen]);

  useEffect(() => {
    editorRef.current = editorEvent;
    if (editorEvent) setDraft((current) => replaceEvent(current, editorEvent));
  }, [editorEvent, setDraft]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        saveState === "unsaved" ||
        saveState === "saving" ||
        saveState === "error"
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [saveState]);

  const updateEditor = (updater: (event: RecentEvent) => RecentEvent) => {
    setEditorEvent((current) =>
      current
        ? { ...updater(current), updatedAt: new Date().toISOString() }
        : current,
    );
    setResultMessage("");
  };

  const saveEvent = async (
    eventToSave: RecentEvent,
    confirmSlugChange = false,
  ) => {
    const savingSnapshot = eventSnapshot(eventToSave);
    setSaveState("saving");
    setSaveMessage("Saving…");
    try {
      const formData = new FormData();
      formData.set("event", JSON.stringify(eventToSave));
      formData.set("expectedUpdatedAt", expectedUpdatedAtRef.current);
      formData.set("confirmSlugChange", String(confirmSlugChange));
      const usedPendingIds = new Set(
        (eventToSave.media ?? [])
          .filter((item) => item.src.startsWith("pending:"))
          .map((item) => item.src.slice("pending:".length)),
      );
      pendingUploads
        .filter((upload) => usedPendingIds.has(upload.id))
        .forEach((upload) => {
          formData.append(
            "files",
            upload.file,
            `${upload.id}-${upload.file.name}`,
          );
        });
      const response = await fetch("/api/admin/newsletters/save", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.requiresSlugConfirmation) {
          setSaveState("error");
          setSaveMessage(
            "Confirm the web-address change in Advanced settings.",
          );
          return null;
        }
        if (Array.isArray(result.issues)) setErrorSummary(result.issues);
        throw new Error(result.error || "The newsletter could not be saved.");
      }
      const saved = result.event as RecentEvent;
      expectedUpdatedAtRef.current = saved.updatedAt;
      lastSavedSnapshotRef.current = eventSnapshot(saved);
      setBaseline((current) => replaceEvent(current, saved));
      const latest = editorRef.current;
      if (latest?.id === saved.id && eventSnapshot(latest) === savingSnapshot) {
        setEditorEvent(saved);
      } else if (latest?.id === saved.id) {
        const savedById = new Map(
          (saved.media ?? []).map((item) => [item.id, item]),
        );
        setEditorEvent({
          ...latest,
          media: (latest.media ?? []).map((item) =>
            item.src.startsWith("pending:")
              ? savedById.get(item.id) || item
              : item,
          ),
          image: latest.image?.src.startsWith("pending:")
            ? savedById.get(latest.image.id) || latest.image
            : latest.image,
        });
      }
      setPendingUploads((current) => {
        const unresolved = new Set(
          (editorRef.current?.media ?? [])
            .filter((item) => item.src.startsWith("pending:"))
            .map((item) => item.src.slice(8)),
        );
        current
          .filter((upload) => !unresolved.has(upload.id))
          .forEach((upload) => URL.revokeObjectURL(upload.previewUrl));
        return current.filter((upload) => unresolved.has(upload.id));
      });
      localStorage.removeItem(`${LOCAL_BACKUP_PREFIX}${saved.id}`);
      setSaveState("saved");
      setSaveMessage(
        result.warning ? "Saved — history snapshot unavailable" : "Saved",
      );
      setErrorSummary([]);
      return saved;
    } catch (error) {
      setSaveState("error");
      setSaveMessage(
        error instanceof Error
          ? `Could not save — ${error.message}`
          : "Could not save — retry",
      );
      return null;
    }
  };

  useEffect(() => {
    if (!editorEvent) return;
    const snapshot = eventSnapshot(editorEvent);
    if (snapshot === lastSavedSnapshotRef.current) return;
    setSaveState("unsaved");
    setSaveMessage("Unsaved changes");
    try {
      localStorage.setItem(
        `${LOCAL_BACKUP_PREFIX}${editorEvent.id}`,
        JSON.stringify(editorEvent),
      );
    } catch {
      // The server autosave remains available if browser storage is disabled.
    }
    const timer = window.setTimeout(() => void saveEvent(editorEvent), 1400);
    return () => window.clearTimeout(timer);
  }, [editorEvent]);

  const openEditor = (event: RecentEvent) => {
    setSelectedId(event.id);
    setEditorEvent(event);
    editorRef.current = event;
    expectedUpdatedAtRef.current = event.updatedAt;
    lastSavedSnapshotRef.current = eventSnapshot(event);
    setActiveSection(0);
    setVisitedSections(new Set());
    setSaveState("saved");
    setSaveMessage("Saved");
    setErrorSummary([]);
    try {
      const local = localStorage.getItem(`${LOCAL_BACKUP_PREFIX}${event.id}`);
      const recovered = local ? (JSON.parse(local) as RecentEvent) : null;
      setRecoveryDraft(
        recovered && eventSnapshot(recovered) !== eventSnapshot(event)
          ? recovered
          : null,
      );
    } catch {
      setRecoveryDraft(null);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startCreation = () => {
    const candidate = draft.recentEvents.find(
      (event) =>
        (event.lifecycleStatus ?? "active") === "active" &&
        !event.published &&
        isEmptyDraft(event) &&
        Date.now() - Date.parse(event.createdAt) < 30 * 24 * 60 * 60 * 1000,
    );
    if (candidate) setEmptyDraftCandidate(candidate);
    else setCreationOpen(true);
  };

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("action") !== "create")
      return;
    startCreation();
    window.history.replaceState(null, "", "/admin/website#admin-recent-events");
  }, []);

  const createNewsletter = (contentType: NewsletterContentType) => {
    const event = makeNewsletter(contentType);
    setDraft((current) => replaceEvent(current, event));
    setCreationOpen(false);
    setEmptyDraftCandidate(null);
    openEditor(event);
  };

  const filteredEvents = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en-US");
    return draft.recentEvents
      .filter((event) => {
        const status = statusFor(event);
        const statusMatch =
          statusFilter === "All" ||
          status === statusFilter ||
          (statusFilter === "Drafts" && status === "Draft") ||
          (statusFilter === "Events" && event.contentType === "event");
        const queryMatch =
          !normalized ||
          [event.title, event.summary, event.category, ...(event.tags ?? [])]
            .join(" ")
            .toLocaleLowerCase("en-US")
            .includes(normalized);
        return (
          statusMatch &&
          queryMatch &&
          (!categoryFilter || event.category === categoryFilter) &&
          (!yearFilter || event.date.startsWith(yearFilter))
        );
      })
      .sort((left, right) => {
        if (sort === "date-desc")
          return Date.parse(right.date) - Date.parse(left.date);
        if (sort === "date-asc")
          return Date.parse(left.date) - Date.parse(right.date);
        if (sort === "title")
          return (left.title || "Untitled").localeCompare(
            right.title || "Untitled",
          );
        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      });
  }, [
    categoryFilter,
    draft.recentEvents,
    query,
    sort,
    statusFilter,
    yearFilter,
  ]);
  const years = [
    ...new Set(
      draft.recentEvents
        .map((event) => event.date.slice(0, 4))
        .filter((value) => /^\d{4}$/.test(value)),
    ),
  ]
    .sort()
    .reverse();
  const pageCount = Math.max(
    1,
    Math.ceil(filteredEvents.length / ADMIN_PAGE_SIZE),
  );
  const visibleEvents = filteredEvents.slice(
    (Math.min(page, pageCount) - 1) * ADMIN_PAGE_SIZE,
    Math.min(page, pageCount) * ADMIN_PAGE_SIZE,
  );

  const saveSpecificEvent = async (event: RecentEvent) => {
    const previousEditor = editorRef.current;
    const previousExpected = expectedUpdatedAtRef.current;
    editorRef.current = event;
    expectedUpdatedAtRef.current =
      baseline.recentEvents.find((item) => item.id === event.id)?.updatedAt ||
      event.updatedAt;
    const saved = await saveEvent(event);
    editorRef.current = previousEditor;
    expectedUpdatedAtRef.current = previousExpected;
    if (saved) {
      setDraft((current) => replaceEvent(current, saved));
      setBaseline((current) => replaceEvent(current, saved));
    }
    return saved;
  };

  const duplicateEvent = async (event: RecentEvent, openAfterSave = true) => {
    const now = new Date().toISOString();
    const copy: RecentEvent = {
      ...event,
      id: `event-${crypto.randomUUID()}`,
      title: `Copy of ${event.title || "Untitled newsletter"}`,
      slug: `${slugify(event.title || "newsletter")}-copy-${now.slice(5, 10).replace("-", "")}`,
      slugHistory: [],
      published: false,
      websitePublishRequested: false,
      publishedAt: null,
      featured: false,
      lifecycleStatus: "active",
      archivedAt: null,
      trashedAt: null,
      notifySubscribers: false,
      showInCommunityCalendar: false,
      calendar: { status: "not_added", publishedAt: null, error: null },
      newsletter: {
        status: "not_sent",
        sentAt: null,
        brevoCampaignId: null,
        error: null,
      },
      createdAt: now,
      updatedAt: now,
    };
    const saved = await saveSpecificEvent(copy);
    if (saved && openAfterSave) openEditor(saved);
    return saved;
  };

  const lifecycleAction = async (
    event: RecentEvent,
    lifecycleStatus: "active" | "archived" | "trash",
  ) => {
    const now = new Date().toISOString();
    await saveSpecificEvent({
      ...event,
      lifecycleStatus,
      archivedAt: lifecycleStatus === "archived" ? now : event.archivedAt,
      trashedAt:
        lifecycleStatus === "trash"
          ? now
          : lifecycleStatus === "active"
            ? null
            : event.trashedAt,
      updatedAt: now,
    });
  };

  const permanentlyDelete = async (event: RecentEvent) => {
    if (
      event.lifecycleStatus !== "trash" ||
      !window.confirm(
        `Permanently delete “${event.title || "Untitled draft"}”? This cannot be undone.`,
      )
    )
      return;
    const response = await fetch("/api/admin/newsletters/actions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        newsletterId: event.id,
        confirmed: true,
      }),
    });
    if (response.ok) {
      setDraft((current) => removeEvent(current, event.id));
      setBaseline((current) => removeEvent(current, event.id));
    }
  };

  const bulkDuplicate = async () => {
    const selected = draft.recentEvents.filter((event) =>
      selectedIds.includes(event.id),
    );
    if (!selected.length) return;
    setBulkWorking(true);
    for (const event of selected) await duplicateEvent(event, false);
    setSelectedIds([]);
    setBulkWorking(false);
  };

  const bulkMoveToTrash = async () => {
    const selected = draft.recentEvents.filter((event) =>
      selectedIds.includes(event.id),
    );
    if (
      !selected.length ||
      !window.confirm(
        `Move ${selected.length} selected newsletter${selected.length === 1 ? "" : "s"} to Trash?`,
      )
    )
      return;
    setBulkWorking(true);
    for (const event of selected) await lifecycleAction(event, "trash");
    setSelectedIds([]);
    setBulkWorking(false);
  };

  if (!selectedId || !editorEvent) {
    return (
      <section
        className="admin-newsletter-library"
        aria-labelledby="admin-newsletter-title"
      >
        <header className="admin-newsletter-library__header">
          <div>
            <p className="eyebrow">Website publishing</p>
            <h2 id="admin-newsletter-title">Newsletters and updates</h2>
            <p>
              Find an existing update or create one new draft. Each newsletter
              opens in its own focused editor.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={startCreation}>
            <Plus size={18} /> Create newsletter
          </button>
        </header>
        <div
          className="admin-newsletter-status-tabs"
          role="group"
          aria-label="Newsletter status"
        >
          {[
            "All",
            "Drafts",
            "Ready to publish",
            "Published on website",
            "Sent to subscribers",
            "Events",
            "Archived",
            "Trash",
          ].map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={statusFilter === status}
              onClick={() => {
                setStatusFilter(status);
                setPage(1);
              }}
            >
              {status}
            </button>
          ))}
        </div>
        <div className="admin-newsletter-filters">
          <label className="admin-newsletter-search">
            <Search size={17} />
            <span>Search</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Title, summary, category…"
            />
          </label>
          <label>
            <span>Category</span>
            <select
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All categories</option>
              {NEWSLETTER_CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Year</span>
            <select
              value={yearFilter}
              onChange={(event) => {
                setYearFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All years</option>
              {years.map((year) => (
                <option key={year}>{year}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="edited-desc">Recently edited</option>
              <option value="date-desc">Newest date</option>
              <option value="date-asc">Oldest date</option>
              <option value="title">Title A–Z</option>
            </select>
          </label>
        </div>
        <div className="admin-newsletter-library-tools">
          <label className="admin-newsletter-select-all">
            <input
              type="checkbox"
              checked={
                visibleEvents.length > 0 &&
                visibleEvents.every((event) => selectedIds.includes(event.id))
              }
              onChange={(input) =>
                setSelectedIds((current) =>
                  input.target.checked
                    ? [
                        ...new Set([
                          ...current,
                          ...visibleEvents.map((event) => event.id),
                        ]),
                      ]
                    : current.filter(
                        (id) => !visibleEvents.some((event) => event.id === id),
                      ),
                )
              }
            />
            Select this page
          </label>
          <p className="admin-newsletter-count" role="status">
            {filteredEvents.length} newsletter
            {filteredEvents.length === 1 ? "" : "s"}
          </p>
        </div>
        {selectedIds.length ? (
          <div
            className="admin-newsletter-bulk-toolbar"
            role="region"
            aria-label="Selected newsletter actions"
          >
            <strong>{selectedIds.length} selected</strong>
            <button
              type="button"
              className="btn-secondary"
              disabled={bulkWorking}
              onClick={() => void bulkDuplicate()}
            >
              <Copy size={16} /> Duplicate selected
            </button>
            <button
              type="button"
              className="btn-secondary danger"
              disabled={bulkWorking}
              onClick={() => void bulkMoveToTrash()}
            >
              <Trash2 size={16} /> Move selected to Trash
            </button>
            <button
              type="button"
              className="text-link"
              disabled={bulkWorking}
              onClick={() => setSelectedIds([])}
            >
              Clear
            </button>
          </div>
        ) : null}
        <div
          className="admin-newsletter-list"
          role={visibleEvents.length ? "list" : undefined}
        >
          {visibleEvents.map((event) => {
            const cover = newsletterCover(event);
            return (
              <article
                className={`admin-newsletter-row${selectedIds.includes(event.id) ? " is-selected" : ""}`}
                key={event.id}
                role="listitem"
              >
                <label className="admin-newsletter-row__select">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(event.id)}
                    onChange={(input) =>
                      setSelectedIds((current) =>
                        input.target.checked
                          ? [...current, event.id]
                          : current.filter((id) => id !== event.id),
                      )
                    }
                  />
                  <span className="sr-only">
                    Select {event.title || "Untitled draft"}
                  </span>
                </label>
                <div className="admin-newsletter-row__cover">
                  <ResponsiveImage
                    src={cover?.src || FALLBACK_COVER}
                    alt=""
                    imgClassName="h-full w-full object-cover"
                    loading="lazy"
                  />
                  {!cover ? <span>RSK</span> : null}
                </div>
                <div className="admin-newsletter-row__title">
                  <p>
                    {event.contentType === "event"
                      ? "Event announcement"
                      : "Dojo newsletter"}{" "}
                    · {event.category || "Dojo News"}
                  </p>
                  <h3>{event.title.trim() || "Untitled draft"}</h3>
                  <span>
                    {dateLabel(event.date)} · Edited{" "}
                    {dateLabel(event.updatedAt)}
                  </span>
                </div>
                <div className="admin-newsletter-row__statuses">
                  <AdminStatusPill tone={event.published ? "success" : "muted"}>
                    {websiteLabel(event)}
                  </AdminStatusPill>
                  <AdminStatusPill
                    tone={
                      event.newsletter?.status === "sent"
                        ? "success"
                        : event.newsletter?.status === "failed"
                          ? "error"
                          : "muted"
                    }
                  >
                    {emailLabel(event)}
                  </AdminStatusPill>
                </div>
                <AdminStatusPill tone={statusTone(event)}>
                  {statusFor(event)}
                </AdminStatusPill>
                <div className="admin-newsletter-row__actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => openEditor(event)}
                  >
                    Edit
                  </button>
                  {event.published && event.slug ? (
                    <a
                      className="btn-secondary"
                      href={`/newsletter/${event.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Preview <ExternalLink size={15} />
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        openEditor(event);
                        setPreviewMode("web");
                      }}
                    >
                      Preview
                    </button>
                  )}
                  <details>
                    <summary
                      aria-label={`More actions for ${event.title || "Untitled draft"}`}
                    >
                      <MoreHorizontal size={20} />
                    </summary>
                    <div>
                      <button
                        type="button"
                        onClick={() => void duplicateEvent(event)}
                      >
                        <Copy size={15} /> Duplicate
                      </button>
                      {event.lifecycleStatus === "archived" ||
                      event.lifecycleStatus === "trash" ? (
                        <button
                          type="button"
                          onClick={() => void lifecycleAction(event, "active")}
                        >
                          <RotateCcw size={15} /> Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            void lifecycleAction(event, "archived")
                          }
                        >
                          <Archive size={15} /> Archive
                        </button>
                      )}
                      {event.lifecycleStatus !== "trash" ? (
                        <button
                          type="button"
                          onClick={() => void lifecycleAction(event, "trash")}
                        >
                          <Trash2 size={15} /> Move to trash
                        </button>
                      ) : null}
                      {event.lifecycleStatus === "trash" ? (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void permanentlyDelete(event)}
                        >
                          <Trash2 size={15} /> Permanently delete
                        </button>
                      ) : null}
                    </div>
                  </details>
                </div>
              </article>
            );
          })}
          {!visibleEvents.length ? (
            <div className="admin-newsletter-empty">
              <Inbox size={28} />
              <h3>No newsletters found</h3>
              <p>Clear a filter or create a new newsletter.</p>
            </div>
          ) : null}
        </div>
        {pageCount > 1 ? (
          <nav
            className="admin-newsletter-pagination"
            aria-label="Newsletter library pages"
          >
            <button
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {pageCount}
            </span>
            <button
              disabled={page >= pageCount}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </nav>
        ) : null}
        {emptyDraftCandidate ? (
          <div className="admin-newsletter-dialog-backdrop">
            <section
              role="dialog"
              aria-modal="true"
              className="admin-newsletter-choice-dialog"
              tabIndex={-1}
            >
              <p className="eyebrow">Recent empty draft</p>
              <h2>Continue your unfinished draft?</h2>
              <p>
                There is already a completely empty draft from{" "}
                {dateLabel(emptyDraftCandidate.createdAt)}.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  openEditor(emptyDraftCandidate);
                  setEmptyDraftCandidate(null);
                }}
              >
                Continue draft
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEmptyDraftCandidate(null);
                  setCreationOpen(true);
                }}
              >
                Start another intentionally
              </button>
              <button
                type="button"
                className="text-link"
                onClick={() => setEmptyDraftCandidate(null)}
              >
                Cancel
              </button>
            </section>
          </div>
        ) : null}
        {creationOpen ? (
          <div className="admin-newsletter-dialog-backdrop">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="newsletter-type-title"
              className="admin-newsletter-choice-dialog"
              tabIndex={-1}
            >
              <button
                type="button"
                className="admin-newsletter-dialog-close"
                aria-label="Close"
                onClick={() => setCreationOpen(false)}
              >
                <X size={20} />
              </button>
              <p className="eyebrow">Create newsletter</p>
              <h2 id="newsletter-type-title">What are you creating?</h2>
              <div className="admin-newsletter-type-grid">
                <button
                  type="button"
                  onClick={() => createNewsletter("newsletter")}
                >
                  <FileText size={28} />
                  <strong>Dojo newsletter or update</strong>
                  <span>
                    News, classes, examinations, workshops, and community notes.
                  </span>
                </button>
                <button type="button" onClick={() => createNewsletter("event")}>
                  <CalendarDays size={28} />
                  <strong>Event announcement</strong>
                  <span>
                    A newsletter update with event date, place, and registration
                    details.
                  </span>
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    );
  }

  const publicationIssues = newsletterPublicationIssues(editorEvent);
  const presentationReady = Boolean(
    editorEvent.presentation?.originalMediaId &&
    editorEvent.presentation?.pdfMediaId &&
    editorEvent.presentation?.slideCount,
  );
  const sectionStates = [
    editorEvent.title &&
    editorEvent.summary &&
    editorEvent.category &&
    editorEvent.date
      ? "complete"
      : "attention",
    editorEvent.newsletterFormat === "presentation" ||
    editorEvent.newsletterFormat === "article"
      ? "complete"
      : "attention",
    editorEvent.newsletterFormat === "presentation"
      ? presentationReady
        ? "complete"
        : "attention"
      : editorEvent.newsletterFormat === "article" && collectNewsletterDocumentText(
            editorEvent.bodyContent ??
              plainTextNewsletterDocument(editorEvent.body),
          ).trim()
        ? "complete"
        : "attention",
    editorEvent.websitePublishRequested || editorEvent.notifySubscribers
      ? "complete"
      : "attention",
    publicationIssues.length ? "attention" : "complete",
  ];
  const media = previewMedia(editorEvent, pendingUploads);
  const cover = media.find(
    (item) => item.id === editorEvent.coverImageId && item.type === "image",
  );
  const relatedOptions = draft.recentEvents.filter(
    (event) =>
      event.id !== editorEvent.id &&
      event.published &&
      (event.lifecycleStatus ?? "active") === "active",
  );

  const addImages = async (
    inputEvent: ChangeEvent<HTMLInputElement>,
    asCover = false,
  ) => {
    const files = Array.from(inputEvent.target.files ?? []);
    inputEvent.target.value = "";
    const existingPhotoCount = (editorEvent.media ?? []).filter(
      (item) => item.type === "image",
    ).length;
    if (existingPhotoCount + files.length > MAX_EVENT_PHOTOS) {
      setErrorSummary([
        `Use at most ${MAX_EVENT_PHOTOS} newsletter images. Remove an image before adding another.`,
      ]);
      return;
    }
    if (pendingUploads.length + files.length > MAX_PENDING_FILES) {
      setErrorSummary([
        `Upload at most ${MAX_PENDING_FILES} new files in one save.`,
      ]);
      return;
    }
    try {
      const additions: MediaItem[] = [];
      const uploads: PendingUpload[] = [];
      for (const file of files) {
        const converted = await convertImage(file);
        const id = `upload-${crypto.randomUUID()}`;
        uploads.push({
          id,
          file: converted,
          previewUrl: URL.createObjectURL(converted),
        });
        additions.push({
          id,
          src: `pending:${id}`,
          alt: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
          type: "image",
          objectPosition: "50% 50%",
        });
      }
      setPendingUploads((current) => [...current, ...uploads]);
      updateEditor((current) => ({
        ...current,
        media: [...(current.media ?? []), ...additions],
        coverImageId:
          asCover && additions[0] ? additions[0].id : current.coverImageId,
        image: asCover && additions[0] ? additions[0] : current.image,
      }));
    } catch (error) {
      setErrorSummary([
        error instanceof Error
          ? error.message
          : "The image could not be added.",
      ]);
    }
  };

  const addDocuments = (inputEvent: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(inputEvent.target.files ?? []);
    inputEvent.target.value = "";
    if (pendingUploads.length + files.length > MAX_PENDING_FILES) {
      setErrorSummary([
        `Upload at most ${MAX_PENDING_FILES} new files in one save.`,
      ]);
      return;
    }
    const additions: MediaItem[] = [];
    const uploads: PendingUpload[] = [];
    for (const file of files) {
      const kind = documentKind(file);
      if (!kind || file.size > MAX_DOCUMENT_SIZE) {
        setErrorSummary([
          "Documents must be PDF, DOCX, PPT, or PPTX files no larger than 20 MB.",
        ]);
        return;
      }
      const id = `upload-${crypto.randomUUID()}`;
      uploads.push({ id, file, previewUrl: "" });
      additions.push({
        id,
        src: `pending:${id}`,
        type: "document",
        documentKind: kind,
        displayMode: "link",
        title: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
        fileName: file.name,
        fileSize: file.size,
        alt: "",
      });
    }
    setPendingUploads((current) => [...current, ...uploads]);
    updateEditor((current) => ({
      ...current,
      media: [...(current.media ?? []), ...additions],
    }));
  };

  const addPresentationFile = (
    inputEvent: ChangeEvent<HTMLInputElement>,
    target: "originalMediaId" | "pdfMediaId",
  ) => {
    const file = inputEvent.target.files?.[0];
    inputEvent.target.value = "";
    if (!file) return;
    const kind = documentKind(file);
    const expectedKind = target === "originalMediaId" ? "ppt" : "pdf";
    if (kind !== expectedKind || file.size > MAX_DOCUMENT_SIZE) {
      setErrorSummary([
        target === "originalMediaId"
          ? "Choose one PPT or PPTX file no larger than 20 MB."
          : "Choose one PDF file no larger than 20 MB.",
      ]);
      return;
    }
    if (pendingUploads.length >= MAX_PENDING_FILES) {
      setErrorSummary([
        `Upload at most ${MAX_PENDING_FILES} new files in one save.`,
      ]);
      return;
    }
    const id = `upload-${crypto.randomUUID()}`;
    setPendingUploads((current) => [...current, { id, file, previewUrl: "" }]);
    updateEditor((current) => ({
      ...current,
      media: [
        ...(current.media ?? []),
        {
          id,
          src: `pending:${id}`,
          type: "document",
          documentKind: kind,
          displayMode: kind === "pdf" ? "inline" : "link",
          title: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
          fileName: file.name,
          fileSize: file.size,
          alt: "",
        },
      ],
      presentation: {
        ...(current.presentation ?? {
          originalMediaId: null,
          pdfMediaId: null,
          viewerTitle: current.title,
          slideCount: null,
          outline: [],
        }),
        [target]: id,
      },
    }));
  };

  const updateMedia = (id: string, updater: (item: MediaItem) => MediaItem) =>
    updateEditor((current) => ({
      ...current,
      media: (current.media ?? []).map((item) =>
        item.id === id ? updater(item) : item,
      ),
      image: current.image?.id === id ? updater(current.image) : current.image,
    }));
  const removeMedia = (id: string) => {
    const item = editorEvent.media?.find((entry) => entry.id === id);
    if (item?.src.startsWith("pending:")) {
      setPendingUploads((current) => {
        const upload = current.find((entry) => entry.id === item.src.slice(8));
        if (upload?.previewUrl) URL.revokeObjectURL(upload.previewUrl);
        return current.filter((entry) => entry.id !== item.src.slice(8));
      });
    }
    updateEditor((current) => ({
      ...current,
      media: (current.media ?? []).filter((entry) => entry.id !== id),
      image: current.image?.id === id ? undefined : current.image,
      coverImageId: current.coverImageId === id ? null : current.coverImageId,
      presentation: current.presentation
        ? {
            ...current.presentation,
            originalMediaId:
              current.presentation.originalMediaId === id
                ? null
                : current.presentation.originalMediaId,
            pdfMediaId:
              current.presentation.pdfMediaId === id
                ? null
                : current.presentation.pdfMediaId,
          }
        : current.presentation,
    }));
  };
  const moveMedia = (index: number, direction: -1 | 1) =>
    updateEditor((current) => {
      const items = [...(current.media ?? [])];
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= items.length) return current;
      [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
      return { ...current, media: items };
    });

  const publishSelections = async () => {
    const issues = newsletterPublicationIssues(editorEvent);
    if (issues.length) {
      setErrorSummary(issues);
      setActiveSection(4);
      document.getElementById("newsletter-error-summary")?.focus();
      return;
    }
    setPublishing(true);
    const now = new Date().toISOString();
    const finalized: RecentEvent = {
      ...editorEvent,
      published: editorEvent.websitePublishRequested === true,
      publishedAt:
        editorEvent.websitePublishRequested && !editorEvent.published
          ? now
          : editorEvent.publishedAt,
      showInCommunityCalendar: false,
      calendar: { status: "not_added", publishedAt: null, error: null },
      updatedAt: now,
    };
    const saved = await saveEvent(finalized);
    setPublishing(false);
    if (!saved) return;
    setEditorEvent(saved);
    const results = [
      saved.published
        ? "Published successfully"
        : "Website publication left off",
    ];
    setResultMessage(results.join(" · "));
    if (saved.notifySubscribers && saved.newsletter?.status !== "sent") {
      setSendIdempotencyKey(
        `newsletter-send:${saved.id}:${crypto.randomUUID()}`,
      );
      setSendConfirmationOpen(true);
    }
  };

  const sendNewsletter = async () => {
    if (!editorEvent || deliveryStatus.recipientCount == null) return;
    setPublishing(true);
    const response = await fetch("/api/admin/newsletters/send", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": crypto.randomUUID(),
      },
      body: JSON.stringify({
        newsletterId: editorEvent.id,
        idempotencyKey: sendIdempotencyKey,
        confirmedRecipientCount: deliveryStatus.recipientCount,
        confirmed: true,
      }),
    });
    const result = await response.json();
    setPublishing(false);
    if (!response.ok) {
      if (
        result.recipientCountChanged &&
        typeof result.recipientCount === "number"
      ) {
        setDeliveryStatus((current) => ({
          ...current,
          recipientCount: result.recipientCount,
        }));
        setSendIdempotencyKey(
          `newsletter-send:${editorEvent.id}:${crypto.randomUUID()}`,
        );
      }
      setErrorSummary([result.error || "Subscriber email could not be sent."]);
      return;
    }
    const sentEvent: RecentEvent = {
      ...editorEvent,
      newsletter: {
        status: "sent",
        sentAt: result.sentAt,
        brevoCampaignId:
          result.campaignId ?? editorEvent.newsletter?.brevoCampaignId,
        error: null,
      },
    };
    setEditorEvent(sentEvent);
    setDraft((current) => replaceEvent(current, sentEvent));
    setBaseline((current) => replaceEvent(current, sentEvent));
    setSendConfirmationOpen(false);
    setResultMessage(
      `Email sent successfully to ${result.recipientCount} subscriber${result.recipientCount === 1 ? "" : "s"}.${result.warning ? ` ${result.warning}` : ""}`,
    );
  };

  const sendTest = async () => {
    if (!testConfirmed) {
      setErrorSummary([
        "Confirm that the test address is correct before sending.",
      ]);
      return;
    }
    const saved = await saveEvent(editorEvent);
    if (!saved) return;
    setTestSending(true);
    const response = await fetch("/api/admin/newsletters/test", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newsletterId: saved.id,
        email: testEmail,
        confirmed: true,
      }),
    });
    const result = await response.json();
    setTestSending(false);
    if (!response.ok)
      setErrorSummary([result.error || "Test email could not be sent."]);
    else setResultMessage(`Test email sent to ${testEmail}.`);
  };

  return (
    <section
      className="admin-newsletter-editor"
      aria-labelledby="newsletter-editor-title"
    >
      <header className="admin-newsletter-editor__header">
        <div>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setSelectedId(null);
              setEditorEvent(null);
            }}
          >
            <ArrowLeft size={16} /> Newsletter library
          </button>
          <p className="eyebrow">
            {editorEvent.contentType === "event"
              ? "Event announcement"
              : "Dojo newsletter"}
          </p>
          <h2 id="newsletter-editor-title">
            {editorEvent.title || "Untitled draft"}
          </h2>
        </div>
        <div
          className="admin-newsletter-save-status"
          role="status"
          aria-live="polite"
          data-state={saveState}
        >
          {saveState === "saving" ? (
            <LoaderCircle className="spin" size={17} />
          ) : saveState === "error" ? (
            <AlertCircle size={17} />
          ) : (
            <CheckCircle2 size={17} />
          )}
          <span>{saveMessage}</span>
          {saveState === "error" ? (
            <button type="button" onClick={() => void saveEvent(editorEvent)}>
              Retry
            </button>
          ) : null}
        </div>
      </header>
      {recoveryDraft ? (
        <div className="admin-newsletter-recovery" role="status">
          <AlertCircle size={18} />
          <div>
            <strong>Unsaved browser copy found</strong>
            <p>
              Restore the writing kept on this device, or discard it and
              continue with the saved version.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditorEvent(recoveryDraft);
              setRecoveryDraft(null);
            }}
          >
            Restore
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(
                `${LOCAL_BACKUP_PREFIX}${editorEvent.id}`,
              );
              setRecoveryDraft(null);
            }}
          >
            Discard
          </button>
        </div>
      ) : null}
      {errorSummary.length ? (
        <div
          id="newsletter-error-summary"
          className="admin-newsletter-error-summary"
          role="alert"
          tabIndex={-1}
        >
          <AlertCircle size={20} />
          <div>
            <h3>Please review these details</h3>
            <ul>
              {errorSummary.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {resultMessage ? (
        <div className="admin-newsletter-result" role="status">
          <CheckCircle2 size={20} /> {resultMessage}
        </div>
      ) : null}
      <div className="admin-newsletter-editor__layout">
        <nav
          className="admin-newsletter-progress"
          aria-label="Newsletter editor sections"
        >
          <ol>
            {SECTION_LABELS.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  aria-current={activeSection === index ? "step" : undefined}
                  aria-label={`${label}: ${sectionStates[index] === "complete" ? "complete" : visitedSections.has(index) ? "needs attention" : "untouched"}`}
                  data-state={sectionStates[index] === "complete" ? "complete" : visitedSections.has(index) ? "attention" : "untouched"}
                  onClick={() => { setVisitedSections((current) => new Set(current).add(activeSection).add(index)); setActiveSection(index); }}
                >
                  <span>
                    {sectionStates[index] === "complete" ? (
                      <Check size={15} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span>
                    <strong>{label}</strong>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="admin-newsletter-editor__panel">
          {activeSection === 0 ? (
            <section aria-labelledby="newsletter-basic-heading">
              <header>
                <p className="eyebrow">Section 1 of 5</p>
                <h3 id="newsletter-basic-heading">Basic information</h3>
                <p>
                  Give readers enough context to understand the update before
                  they open it.
                </p>
              </header>
              <div className="admin-newsletter-fields">
                <label>
                  <span className="admin-newsletter-field-label">Title <b aria-hidden="true">*</b></span>
                  <input
                    aria-required="true"
                    value={editorEvent.title}
                    onChange={(event) =>
                      updateEditor((current) => {
                        const autoSlug =
                          !current.slug ||
                          current.slug === slugify(current.title);
                        const title = event.target.value;
                        return {
                          ...current,
                          title,
                          slug:
                            !current.published && autoSlug
                              ? slugify(title)
                              : current.slug,
                          emailSettings: {
                            ...current.emailSettings!,
                            subject:
                              current.emailSettings?.subject ===
                                current.title || !current.emailSettings?.subject
                                ? title
                                : current.emailSettings.subject,
                          },
                        };
                      })
                    }
                    aria-describedby="newsletter-title-help"
                  />
                </label>
                <p id="newsletter-title-help" className="admin-help">
                  Example: Summer training schedule and dojo news
                </p>
                <label>
                  <span className="admin-newsletter-field-label">Short summary <b aria-hidden="true">*</b></span>
                  <textarea
                    aria-required="true"
                    value={editorEvent.summary}
                    maxLength={1000}
                    onChange={(event) =>
                      updateEditor((current) => ({
                        ...current,
                        summary: event.target.value,
                        emailSettings: {
                          ...current.emailSettings!,
                          previewText:
                            current.emailSettings?.previewText ===
                              current.summary ||
                            !current.emailSettings?.previewText
                              ? event.target.value
                              : current.emailSettings.previewText,
                        },
                      }))
                    }
                    aria-describedby="newsletter-summary-help"
                  />
                </label>
                <p id="newsletter-summary-help" className="admin-help">
                  Used on the archive, homepage, search results, and as the
                  default inbox preview.
                </p>
                <div className="admin-newsletter-field-grid">
                  <label>
                    <span className="admin-newsletter-field-label">Category <b aria-hidden="true">*</b></span>
                    <select
                      aria-required="true"
                      value={editorEvent.category}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          category: event.target
                            .value as RecentEvent["category"],
                        }))
                      }
                    >
                      {NEWSLETTER_CATEGORIES.map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="admin-newsletter-field-label">{editorEvent.contentType === "event"
                      ? "Event date"
                      : "Publication date"} <b aria-hidden="true">*</b></span>
                    <GregorianDateInput
                      admin
                      value={editorEvent.date}
                      onChange={(value) =>
                        updateEditor((current) => ({ ...current, date: value }))
                      }
                    />
                  </label>
                </div>
                {editorEvent.contentType === "event" ? (
                  <fieldset className="admin-newsletter-subsection">
                    <legend>Event details</legend>
                    <div className="admin-newsletter-field-grid">
                      <label>
                        Starts
                        <GregorianDateTimeInput
                          admin
                          value={editorEvent.eventDetails?.startAt || ""}
                          onChange={(value) =>
                            updateEditor((current) => ({
                              ...current,
                              eventDetails: {
                                ...current.eventDetails!,
                                startAt: value,
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        Ends (optional)
                        <GregorianDateTimeInput
                          admin
                          value={editorEvent.eventDetails?.endAt || ""}
                          onChange={(value) =>
                            updateEditor((current) => ({
                              ...current,
                              eventDetails: {
                                ...current.eventDetails!,
                                endAt: value,
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        Location
                        <input
                          value={editorEvent.eventDetails?.location || ""}
                          onChange={(event) =>
                            updateEditor((current) => ({
                              ...current,
                              eventDetails: {
                                ...current.eventDetails!,
                                location: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        Registration link
                        <input
                          type="url"
                          value={
                            editorEvent.eventDetails?.registrationUrl || ""
                          }
                          onChange={(event) =>
                            updateEditor((current) => ({
                              ...current,
                              eventDetails: {
                                ...current.eventDetails!,
                                registrationUrl: event.target.value,
                              },
                            }))
                          }
                          placeholder="https://…"
                        />
                      </label>
                    </div>
                  </fieldset>
                ) : null}
                <div className="admin-newsletter-cover-summary">
                  {cover ? <img src={cover.src} alt="" /> : <div>RSK</div>}
                  <span>
                    <strong>
                      {cover
                        ? "Cover image selected"
                        : "Branded fallback will be used"}
                    </strong>
                    <small>
                      Cover images are separate from documents and body media.
                    </small>
                  </span>
                  <button type="button" onClick={() => setActiveSection(2)}>
                    Manage cover
                  </button>
                </div>
                <details className="admin-newsletter-advanced">
                  <summary>
                    Advanced settings <ChevronDown size={16} />
                  </summary>
                  <label>
                    Web address
                    <input
                      value={editorEvent.slug}
                      disabled={editorEvent.published}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          slug: slugify(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <p className="admin-help">
                    Created automatically. Published web addresses are protected
                    to preserve existing links.
                  </p>
                  <label>
                    Tags
                    <input
                      value={(editorEvent.tags ?? []).join(", ")}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          tags: event.target.value
                            .split(",")
                            .map((tag) => tag.trim())
                            .filter(Boolean)
                            .slice(0, 10),
                        }))
                      }
                      placeholder="children, grading, summer"
                    />
                  </label>
                  <label className="admin-newsletter-checkbox">
                    <input
                      type="checkbox"
                      checked={editorEvent.featured === true}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          featured: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      <strong>Feature on the archive when recent</strong>
                      <small>
                        The homepage still uses the newest published newsletters
                        automatically.
                      </small>
                    </span>
                  </label>
                </details>
              </div>
            </section>
          ) : null}
          {activeSection === 1 ? (
            <section aria-labelledby="newsletter-format-heading">
              <header>
                <p className="eyebrow">Section 2 of 5</p>
                <h3 id="newsletter-format-heading">Choose format</h3>
                <p>
                  Choose how readers will experience this newsletter. You can
                  change this while it is a draft.
                </p>
              </header>
              <fieldset className="admin-newsletter-format">
                <legend>Newsletter format</legend>
                {(
                  [
                    [
                      "article",
                      "Normal newsletter",
                      "Write a readable article with headings, images, video, and optional attachments.",
                    ],
                    [
                      "presentation",
                      "Presentation newsletter",
                      "Publish an on-page PDF slide viewer and keep the original PowerPoint available to download.",
                    ],
                  ] as Array<[NewsletterFormat, string, string]>
                ).map(([format, title, copy]) => (
                  <label key={format}>
                    <input
                      type="radio"
                      name="newsletter-format"
                      value={format}
                      checked={
                        editorEvent.newsletterFormat === format
                      }
                      onChange={() =>
                        updateEditor((current) => ({
                          ...current,
                          newsletterFormat: format,
                          presentation: current.presentation ?? {
                            originalMediaId: null,
                            pdfMediaId: null,
                            viewerTitle: current.title,
                            slideCount: null,
                            outline: [],
                          },
                        }))
                      }
                    />
                    <span>
                      <strong>{title}</strong>
                      <small>{copy}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
            </section>
          ) : null}
          {activeSection === 2 ? (
            <section aria-labelledby="newsletter-media-heading">
              <header>
                <p className="eyebrow">Section 3 of 5</p>
                <h3 id="newsletter-media-heading">Create content</h3>
                <p>
                  {editorEvent.newsletterFormat === "presentation"
                    ? "Add both presentation files, then check the public viewer details."
                    : editorEvent.newsletterFormat === "article"
                      ? "Write the newsletter, then place images, videos, and documents in the body."
                      : "Choose a newsletter format before creating its content."}
                </p>
              </header>
              {editorEvent.newsletterFormat === "presentation" ? (
                <fieldset className="admin-newsletter-presentation">
                  <legend>Presentation files</legend>
                  <div className="admin-newsletter-presentation__files">
                    <label
                      className={
                        editorEvent.presentation?.originalMediaId
                          ? "is-complete"
                          : ""
                      }
                    >
                      <span>
                        <strong>Original PowerPoint</strong>
                        <small>
                          PPT or PPTX · available as the original download
                        </small>
                      </span>
                      <span>
                        {editorEvent.presentation?.originalMediaId
                          ? "Ready"
                          : "Required"}
                      </span>
                      <input
                        type="file"
                        accept=".ppt,.pptx"
                        onChange={(event) =>
                          addPresentationFile(event, "originalMediaId")
                        }
                      />
                    </label>
                    <label
                      className={
                        editorEvent.presentation?.pdfMediaId
                          ? "is-complete"
                          : ""
                      }
                    >
                      <span>
                        <strong>Web viewer PDF</strong>
                        <small>
                          PDF · displayed directly on the newsletter page
                        </small>
                      </span>
                      <span>
                        {editorEvent.presentation?.pdfMediaId
                          ? "Ready"
                          : "Required"}
                      </span>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(event) =>
                          addPresentationFile(event, "pdfMediaId")
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Viewer title
                    <input
                      value={
                        editorEvent.presentation?.viewerTitle ||
                        editorEvent.title
                      }
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          presentation: {
                            ...(current.presentation ?? {
                              originalMediaId: null,
                              pdfMediaId: null,
                              slideCount: null,
                              outline: [],
                            }),
                            viewerTitle: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Number of slides{" "}
                    <small>
                      Required · enter the page count shown in the exported PDF.
                    </small>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="999"
                      required
                      value={editorEvent.presentation?.slideCount ?? ""}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          presentation: {
                            ...(current.presentation ?? {
                              originalMediaId: null,
                              pdfMediaId: null,
                              viewerTitle: current.title,
                              outline: [],
                            }),
                            slideCount: event.target.value
                              ? Math.max(
                                  1,
                                  Math.min(999, Number(event.target.value)),
                                )
                              : null,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Slide outline{" "}
                    <small>
                      Optional · one line per slide or section for search and
                      accessibility.
                    </small>
                    <textarea
                      value={(editorEvent.presentation?.outline ?? []).join(
                        "\n",
                      )}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          presentation: {
                            ...(current.presentation ?? {
                              originalMediaId: null,
                              pdfMediaId: null,
                              viewerTitle: current.title,
                              slideCount: null,
                            }),
                            outline: event.target.value
                              .split("\n")
                              .map((line) => line.trim())
                              .filter(Boolean)
                              .slice(0, 100),
                          },
                        }))
                      }
                    />
                  </label>
                  <p className="admin-help">
                    PowerPoint files are never parsed in the browser. The PDF is
                    the stable web copy; the source file remains available to
                    download.
                  </p>
                </fieldset>
              ) : editorEvent.newsletterFormat === "article" ? (
                <>
                  <Suspense
                    fallback={
                      <div
                        className="admin-newsletter-rich-editor min-h-64"
                        role="status"
                      >
                        Loading rich-text editor…
                      </div>
                    }
                  >
                    <NewsletterRichEditor
                      value={editorEvent.bodyContent}
                      fallbackBody={editorEvent.body}
                      onChange={(document: NewsletterDocument) =>
                        updateEditor((current) => ({
                          ...current,
                          bodyContent: document,
                          body: collectNewsletterDocumentText(document),
                        }))
                      }
                    />
                  </Suspense>
                  <button
                    type="button"
                    className="btn-secondary admin-newsletter-inline-preview"
                    onClick={() => setPreviewMode("web")}
                  >
                    <Laptop size={17} /> Preview webpage
                  </button>
                </>
              ) : (
                <div className="admin-newsletter-format-required">
                  <p>Select Normal newsletter or Presentation newsletter first.</p>
                  <button type="button" className="btn-primary" onClick={() => setActiveSection(1)}>Choose format</button>
                </div>
              )}
              <fieldset className="admin-newsletter-subsection">
                <legend>Cover image</legend>
                <div className="admin-newsletter-cover-editor">
                  <div className="admin-newsletter-cover-preview">
                    <ResponsiveImage
                      src={cover?.src || FALLBACK_COVER}
                      alt=""
                      imgClassName="h-full w-full object-cover"
                      objectPosition={cover?.objectPosition || "50% 50%"}
                    />
                    {!cover ? <span>Branded fallback</span> : null}
                  </div>
                  <div>
                    <label className="btn-secondary">
                      <Upload size={16} /> Upload new cover
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        hidden
                        onChange={(event) => void addImages(event, true)}
                      />
                    </label>
                    {media.filter((item) => item.type === "image").length ? (
                      <label>
                        Choose an existing image
                        <select
                          value={editorEvent.coverImageId || ""}
                          onChange={(event) =>
                            updateEditor((current) => ({
                              ...current,
                              coverImageId: event.target.value || null,
                              image: current.media?.find(
                                (item) => item.id === event.target.value,
                              ),
                            }))
                          }
                        >
                          <option value="">Use branded fallback</option>
                          {media
                            .filter((item) => item.type === "image")
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.alt || item.title || "Untitled image"}
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : null}
                    {cover ? (
                      <>
                        <label>
                          Cover alt text
                          <input
                            value={cover.alt}
                            onChange={(event) =>
                              updateMedia(cover.id, (item) => ({
                                ...item,
                                alt: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          Focal point
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={
                              Number(
                                cover.objectPosition
                                  ?.split(" ")[0]
                                  ?.replace("%", ""),
                              ) || 50
                            }
                            onChange={(event) =>
                              updateMedia(cover.id, (item) => ({
                                ...item,
                                objectPosition: `${event.target.value}% 50%`,
                              }))
                            }
                          />
                        </label>
                      </>
                    ) : null}
                  </div>
                </div>
              </fieldset>
              <div className="admin-newsletter-media-actions">
                <label className="btn-secondary">
                  <ImagePlus size={16} /> Add body images
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    hidden
                    onChange={(event) => void addImages(event)}
                  />
                </label>
                <label className="btn-secondary">
                  <Paperclip size={16} /> Add documents
                  <input
                    type="file"
                    accept=".pdf,.docx,.ppt,.pptx"
                    multiple
                    hidden
                    onChange={addDocuments}
                  />
                </label>
              </div>
              <div className="admin-newsletter-video-add">
                <label>
                  Video URL
                  <input
                    id="newsletter-video-url"
                    placeholder="https://www.youtube.com/watch?v=…"
                  />
                </label>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const input = document.getElementById(
                      "newsletter-video-url",
                    ) as HTMLInputElement | null;
                    const src = input?.value.trim() || "";
                    if (!isValidEmbedUrl(src)) {
                      setErrorSummary(["Use a valid YouTube or Vimeo URL."]);
                      return;
                    }
                    updateEditor((current) => ({
                      ...current,
                      media: [
                        ...(current.media ?? []),
                        {
                          id: `video-${crypto.randomUUID()}`,
                          src,
                          type: "video",
                          alt: "",
                          title: "Video",
                          bodyPlacement: {
                            position: 0,
                            widthPercent: 100,
                            align: "center",
                          },
                        },
                      ],
                    }));
                    if (input) input.value = "";
                  }}
                >
                  <Video size={16} /> Add video
                </button>
              </div>
              <div className="admin-newsletter-media-list">
                {media.map((item, index) => (
                  <article key={item.id}>
                    <div className="admin-newsletter-media-thumb">
                      {item.type === "image" ? (
                        <img src={item.src} alt="" />
                      ) : item.type === "video" ? (
                        <iframe
                          src={normalizeEmbedUrl(item.src)}
                          title={item.title || "Video preview"}
                          loading="lazy"
                        />
                      ) : (
                        <FileText size={30} />
                      )}
                    </div>
                    <div className="admin-newsletter-media-fields">
                      <p>
                        <strong>
                          {item.type === "image"
                            ? item.id === editorEvent.coverImageId
                              ? "Cover image"
                              : "Body image"
                            : item.type === "video"
                              ? "Video"
                              : "Downloadable document"}
                        </strong>
                        {item.type === "document"
                          ? ` · ${documentKindLabel(item.documentKind)}${formatFileSize(item.fileSize) ? ` · ${formatFileSize(item.fileSize)}` : ""}`
                          : ""}
                      </p>
                      <label>
                        {item.type === "image" ? "Alt text" : "Public title"}
                        <input
                          value={
                            item.type === "image" ? item.alt : item.title || ""
                          }
                          onChange={(event) =>
                            updateMedia(item.id, (current) =>
                              item.type === "image"
                                ? { ...current, alt: event.target.value }
                                : { ...current, title: event.target.value },
                            )
                          }
                        />
                      </label>
                      <label>
                        Caption (optional)
                        <input
                          value={item.caption || ""}
                          onChange={(event) =>
                            updateMedia(item.id, (current) => ({
                              ...current,
                              caption: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div className="admin-newsletter-media-order">
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={index === 0}
                        onClick={() => moveMedia(index, -1)}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={index === media.length - 1}
                        onClick={() => moveMedia(index, 1)}
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove media"
                        onClick={() => removeMedia(item.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))}
                {!media.length ? (
                  <div className="admin-newsletter-empty">
                    <Paperclip size={24} />
                    <p>No images, videos, or documents yet.</p>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
          {activeSection === 3 ? (
            <section aria-labelledby="newsletter-distribution-heading">
              <header>
                <p className="eyebrow">Section 4 of 5</p>
                <h3 id="newsletter-distribution-heading">
                  Choose where it appears
                </h3>
                <p>
                  Each destination has its own status. Website publishing never
                  sends an email by itself.
                </p>
              </header>
              <fieldset className="admin-newsletter-distribution">
                <legend>Distribution choices</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={editorEvent.websitePublishRequested === true}
                    onChange={(event) =>
                      updateEditor((current) => ({
                        ...current,
                        websitePublishRequested: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    <strong>
                      <Laptop size={20} /> Publish on the website
                    </strong>
                    <small>
                      Make this update publicly available in the Newsletter
                      section.
                    </small>
                    <AdminStatusPill
                      tone={editorEvent.published ? "success" : "muted"}
                    >
                      {websiteLabel(editorEvent)}
                    </AdminStatusPill>
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={editorEvent.notifySubscribers === true}
                    disabled={editorEvent.newsletter?.status === "sent"}
                    onChange={(event) =>
                      updateEditor((current) => ({
                        ...current,
                        notifySubscribers: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    <strong>
                      <Mail size={20} /> Email subscribers
                    </strong>
                    <small>
                      Send this update to the newsletter list. A sent email
                      cannot be recalled or changed.
                    </small>
                    <AdminStatusPill
                      tone={
                        editorEvent.newsletter?.status === "sent"
                          ? "success"
                          : "muted"
                      }
                    >
                      {emailLabel(editorEvent)}
                    </AdminStatusPill>
                  </span>
                </label>
              </fieldset>
              {editorEvent.notifySubscribers ? (
                <fieldset className="admin-newsletter-subsection">
                  <legend>Subscriber email details</legend>
                  <p className="admin-newsletter-recipient-count">
                    <Inbox size={20} />
                    <strong>
                      {deliveryStatus.recipientCount == null
                        ? "Recipient count unavailable"
                        : `${deliveryStatus.recipientCount} current subscriber${deliveryStatus.recipientCount === 1 ? "" : "s"}`}
                    </strong>
                  </p>
                  <label>
                    Email subject
                    <input
                      value={editorEvent.emailSettings?.subject || ""}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          emailSettings: {
                            ...current.emailSettings!,
                            subject: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Inbox preview text
                    <textarea
                      value={editorEvent.emailSettings?.previewText || ""}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          emailSettings: {
                            ...current.emailSettings!,
                            previewText: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <div className="admin-newsletter-field-grid">
                    <label>
                      Sender name
                      <input
                        value={
                          editorEvent.emailSettings?.senderName ||
                          deliveryStatus.senderName
                        }
                        onChange={(event) =>
                          updateEditor((current) => ({
                            ...current,
                            emailSettings: {
                              ...current.emailSettings!,
                              senderName: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <label>
                      Reply-to address
                      <input
                        type="email"
                        value={
                          editorEvent.emailSettings?.replyTo ||
                          deliveryStatus.replyTo
                        }
                        onChange={(event) =>
                          updateEditor((current) => ({
                            ...current,
                            emailSettings: {
                              ...current.emailSettings!,
                              replyTo: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="admin-newsletter-test-email">
                    <label>
                      Verified test address
                      <input
                        type="email"
                        value={testEmail}
                        onChange={(event) => {
                          setTestEmail(event.target.value);
                          setTestConfirmed(false);
                        }}
                        placeholder="you@example.com"
                      />
                    </label>
                    <label className="admin-newsletter-checkbox">
                      <input
                        type="checkbox"
                        checked={testConfirmed}
                        onChange={(event) =>
                          setTestConfirmed(event.target.checked)
                        }
                      />
                      <span>
                        I checked this address and have permission to send the
                        test.
                      </span>
                    </label>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={testSending || !testEmail}
                      onClick={() => void sendTest()}
                    >
                      {testSending ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <Send size={16} />
                      )}{" "}
                      Send test email
                    </button>
                  </div>
                  {deliveryStatus.warning ? (
                    <p className="admin-warning">
                      <AlertCircle size={16} /> {deliveryStatus.warning}
                    </p>
                  ) : null}
                </fieldset>
              ) : null}
            </section>
          ) : null}
          {activeSection === 4 ? (
            <section aria-labelledby="newsletter-review-heading">
              <header>
                <p className="eyebrow">Section 5 of 5</p>
                <h3 id="newsletter-review-heading">Review and publish</h3>
                <p>
                  Review every selected destination before making anything
                  public or sending subscriber email.
                </p>
              </header>
              <div className="admin-newsletter-review-grid">
                {[
                  [
                    "Title",
                    Boolean(editorEvent.title),
                    editorEvent.title || "Missing",
                  ],
                  [
                    "Summary",
                    Boolean(editorEvent.summary),
                    editorEvent.summary ? "Ready" : "Missing",
                  ],
                  [
                    "Category",
                    Boolean(editorEvent.category),
                    editorEvent.category || "Missing",
                  ],
                  [
                    "Format",
                    Boolean(editorEvent.newsletterFormat),
                    editorEvent.newsletterFormat === "presentation"
                      ? "Presentation newsletter"
                      : editorEvent.newsletterFormat === "article"
                        ? "Normal newsletter"
                        : "Missing",
                  ],
                  ...(editorEvent.newsletterFormat === "presentation"
                    ? [
                        [
                          "Presentation files",
                          presentationReady,
                          presentationReady
                            ? "PowerPoint and PDF ready"
                            : "Both files are required",
                        ],
                      ]
                    : []),
                  [
                    "Cover",
                    !cover || Boolean(cover.alt?.trim()),
                    cover
                      ? cover.alt?.trim()
                        ? "Selected image with alt text"
                        : "Add useful alt text"
                      : "Branded fallback",
                  ],
                  [
                    "Website",
                    true,
                    editorEvent.websitePublishRequested
                      ? "Will publish"
                      : "Not selected",
                  ],
                  [
                    "Subscriber email",
                    true,
                    editorEvent.notifySubscribers
                      ? `${deliveryStatus.recipientCount ?? "Unknown"} recipients`
                      : "Not selected",
                  ],
                  [
                    "Attachments",
                    true,
                    `${media.filter((item) => item.type === "document").length} document(s)`,
                  ],
                  ...(editorEvent.contentType === "event"
                    ? [
                        [
                          "Event date",
                          Boolean(
                            editorEvent.eventDetails?.startAt ||
                            editorEvent.date,
                          ),
                          editorEvent.eventDetails?.startAt ||
                            editorEvent.date ||
                            "Missing",
                        ],
                      ]
                    : []),
                ].map(([label, complete, value]) => (
                  <div key={String(label)} data-complete={String(complete)}>
                    {complete ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <AlertCircle size={18} />
                    )}
                    <span>
                      <strong>{label}</strong>
                      <small>{String(value)}</small>
                    </span>
                  </div>
                ))}
              </div>
              <div className="admin-newsletter-preview-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPreviewMode("web")}
                >
                  <Laptop size={17} /> Preview website
                </button>
                {editorEvent.notifySubscribers ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setPreviewMode("email")}
                  >
                    <Mail size={17} /> Preview email
                  </button>
                ) : null}
                {editorEvent.published && editorEvent.slug ? (
                  <a
                    className="btn-secondary"
                    href={`/newsletter/${editorEvent.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={17} /> Open live page
                  </a>
                ) : null}
              </div>
              <div className="admin-newsletter-final-review">
                <h4>Ready to complete these actions?</h4>
                <ul>
                  <li>
                    {editorEvent.websitePublishRequested
                      ? "Publish this newsletter on the website."
                      : "Keep the website version as a draft."}
                  </li>
                  <li>
                    {editorEvent.notifySubscribers
                      ? `Open a final confirmation for ${deliveryStatus.recipientCount ?? "the current"} subscribers.`
                      : "Do not email subscribers."}
                  </li>
                </ul>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={publishing}
                  onClick={() => void publishSelections()}
                >
                  {publishing ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <Save size={18} />
                  )}{" "}
                  Publish selected destinations
                </button>
              </div>
              <details className="admin-newsletter-related">
                <summary>
                  Related newsletters (optional) <ChevronDown size={16} />
                </summary>
                <p>
                  Select up to three published newsletters. Empty slots are
                  filled automatically by category, tags, and recent posts.
                </p>
                {relatedOptions.map((event) => (
                  <label key={event.id}>
                    <input
                      type="checkbox"
                      checked={
                        editorEvent.relatedNewsletterIds?.includes(event.id) ===
                        true
                      }
                      disabled={
                        !editorEvent.relatedNewsletterIds?.includes(event.id) &&
                        (editorEvent.relatedNewsletterIds?.length ?? 0) >= 3
                      }
                      onChange={(input) =>
                        updateEditor((current) => ({
                          ...current,
                          relatedNewsletterIds: input.target.checked
                            ? [
                                ...(current.relatedNewsletterIds ?? []),
                                event.id,
                              ].slice(0, 3)
                            : (current.relatedNewsletterIds ?? []).filter(
                                (id) => id !== event.id,
                              ),
                        }))
                      }
                    />
                    <span>{event.title}</span>
                  </label>
                ))}
              </details>
            </section>
          ) : null}
          <footer className="admin-newsletter-section-navigation">
            <button
              type="button"
              className="btn-secondary"
              disabled={activeSection === 0}
              onClick={() => {
                setVisitedSections((current) => new Set(current).add(activeSection).add(Math.max(0, activeSection - 1)));
                setActiveSection((current) => Math.max(0, current - 1));
              }}
            >
              <ArrowLeft size={16} /> Previous
            </button>
            {activeSection < 4 ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setVisitedSections((current) => new Set(current).add(activeSection).add(Math.min(4, activeSection + 1)));
                  setActiveSection((current) => Math.min(4, current + 1));
                }}
              >
                Next <ArrowRight size={16} />
              </button>
            ) : null}
          </footer>
        </div>
      </div>
      {previewMode ? (
        <PreviewDialog
          event={{ ...editorEvent, media }}
          mode={previewMode}
          onClose={() => setPreviewMode(null)}
        />
      ) : null}
      {sendConfirmationOpen ? (
        <div className="admin-newsletter-dialog-backdrop">
          <section
            className="admin-newsletter-send-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="newsletter-send-title"
            tabIndex={-1}
          >
            <p className="eyebrow">Final subscriber confirmation</p>
            <h2 id="newsletter-send-title">
              Send this newsletter to{" "}
              {deliveryStatus.recipientCount ?? "the current"} subscribers?
            </h2>
            <p className="admin-newsletter-irreversible">
              <AlertCircle size={18} /> Email delivery cannot be undone.
            </p>
            <dl>
              <div>
                <dt>Newsletter</dt>
                <dd>{editorEvent.title}</dd>
              </div>
              <div>
                <dt>Subject</dt>
                <dd>
                  {editorEvent.emailSettings?.subject || editorEvent.title}
                </dd>
              </div>
              <div>
                <dt>Send time</dt>
                <dd>Now</dd>
              </div>
              <div>
                <dt>Website</dt>
                <dd>{editorEvent.published ? "Published" : "Not published"}</dd>
              </div>
            </dl>
            <div>
              <button
                type="button"
                className="btn-secondary"
                disabled={publishing}
                onClick={() => setSendConfirmationOpen(false)}
              >
                Not now
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={publishing || deliveryStatus.recipientCount == null}
                onClick={() => void sendNewsletter()}
              >
                {publishing ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Send size={17} />
                )}{" "}
                Send to {deliveryStatus.recipientCount ?? "subscribers"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
