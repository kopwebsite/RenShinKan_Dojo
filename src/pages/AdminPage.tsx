import {
  AlertCircle,
  CheckCircle,
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
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { MediaSlider } from "../components/MediaSlider";
import { emptyEditableContent, loadEditableContent } from "../lib/content";
import type { EditableContent, MediaItem, RecentEvent } from "../types/editableContent";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 10;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
      setDraft(content);
      setBaseline(content);
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

  const previewMedia = (event: RecentEvent) => {
    return getEventMedia(event).map((item) => {
      if (!item.src.startsWith("pending:")) {
        return item;
      }

      const upload = pendingById.get(item.src.replace("pending:", ""));
      return upload ? { ...item, src: upload.previewUrl } : item;
    });
  };

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError("");

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ password }),
    });

    if (response.ok) {
      sessionStorage.setItem("renshinkan-admin-hint", "true");
      setIsAuthed(true);
      setPassword("");
      return;
    }

    setAuthError("Invalid password");
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
    setDraft((current) => ({
      ...current,
      recentEvents: [makeEvent(), ...current.recentEvents],
    }));
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

  const publish = async () => {
    setPublishStatus("saving");
    setPublishMessage("Publishing content to GitHub...");
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
      setPublishMessage(result.warnings?.length ? "Published with warnings." : "Publish complete.");
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
          <h1 className="mt-3 text-4xl leading-tight text-ink">RenshinKan publishing</h1>
          <p className="mt-4 text-sm leading-6 text-charcoal/72">
            Sign in to edit site content and publish it through the server-side GitHub workflow.
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

  return (
    <section className="container-shell py-12 sm:py-16">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="section-title">Dojo content editor</h1>
          <p className="section-copy">
            Edit recent events, upload event images, and publish the JSON content file to GitHub.
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
            Publishing uses an HttpOnly admin session and a server-side Cloudflare Pages Function. GitHub and Brevo
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
        <section className="surface rounded-[2rem] p-6 sm:p-8">
          {sectionTitle(
            "Recent Events",
            "Create and edit public dojo updates. Published events appear on the Recent Events page.",
          )}
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

            {draft.recentEvents.map((event) => (
              <article key={event.id} className="rounded-[1.5rem] bg-paper/60 p-5 ring-1 ring-ink/10">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-bamboo">Recent Event</p>
                    <p className="mt-2 text-sm text-charcoal/65">Newsletter status: {statusLabel(event)}</p>
                  </div>
                  <button type="button" className="btn-secondary text-vermilion" onClick={() => deleteEvent(event.id)}>
                    <Trash2 size={16} aria-hidden="true" />
                    Delete
                  </button>
                </div>

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

                {previewMedia(event).length ? (
                  <MediaSlider media={previewMedia(event)} label={`${event.title || "Recent event"} media preview`} className="mt-6" />
                ) : null}
              </article>
            ))}
          </div>
        </section>

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
          {sectionTitle("Save / Publish Changes", "Review the publish summary before the server commits content to GitHub.")}
          <button type="button" onClick={() => setConfirmOpen(true)} className="btn-primary">
            <Save size={18} aria-hidden="true" />
            Review Publish
          </button>
        </section>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-5">
          <div className="w-full max-w-xl rounded-[2rem] bg-paper p-7 shadow-soft">
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

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
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
