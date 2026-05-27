import { useEffect, useState } from "react";
import type {
  EditableContent,
  ExamAnnouncement,
  MediaItem,
  NewsletterStatus,
  PassedTestStudent,
  RecentEvent,
} from "../types/editableContent";
import { assetPath } from "../utils/assetPath";

export const emptyEditableContent: EditableContent = {
  version: 1,
  lastPublishedAt: null,
  recentEvents: [],
  examAnnouncement: null,
  historyMedia: [],
  onTheMatMedia: [],
  passedTestStudents: [],
};

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeNewsletterStatus(value: unknown): NewsletterStatus {
  return value === "pending" || value === "sent" || value === "failed" ? value : "not_sent";
}

function normalizeMediaItem(value: unknown): MediaItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const src = asString(value.src);
  const type = value.type === "video" ? "video" : "image";

  if (!id || !src) {
    return null;
  }

  return {
    id,
    src,
    avif: asOptionalString(value.avif),
    webp: asOptionalString(value.webp),
    alt: asString(value.alt),
    caption: asOptionalString(value.caption),
    type,
    title: asOptionalString(value.title),
    objectPosition: asOptionalString(value.objectPosition),
    width: asOptionalNumber(value.width),
    height: asOptionalNumber(value.height),
  };
}

function normalizeMediaList(value: unknown): MediaItem[] {
  return Array.isArray(value)
    ? value.map(normalizeMediaItem).filter((item): item is MediaItem => Boolean(item))
    : [];
}

function normalizeRecentEvent(value: unknown): RecentEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const title = asString(value.title);
  const date = asString(value.date);
  const summary = asString(value.summary);
  const body = asString(value.body);
  const slug = asString(value.slug);
  const createdAt = asString(value.createdAt);
  const updatedAt = asString(value.updatedAt);

  if (!id || !title || !date || !slug || !createdAt || !updatedAt) {
    return null;
  }

  const newsletter = isRecord(value.newsletter)
    ? {
        status: normalizeNewsletterStatus(value.newsletter.status),
        sentAt: typeof value.newsletter.sentAt === "string" ? value.newsletter.sentAt : null,
        brevoCampaignId:
          typeof value.newsletter.brevoCampaignId === "string" || typeof value.newsletter.brevoCampaignId === "number"
            ? value.newsletter.brevoCampaignId
            : null,
        error: typeof value.newsletter.error === "string" ? value.newsletter.error : null,
      }
    : { status: "not_sent" as const, sentAt: null, brevoCampaignId: null, error: null };
  const image = normalizeMediaItem(value.image);
  const media = normalizeMediaList(value.media);

  return {
    id,
    title,
    date,
    summary,
    body,
    slug,
    published: value.published === true,
    image: image ?? undefined,
    media,
    notifySubscribers: value.notifySubscribers === true,
    newsletter,
    createdAt,
    updatedAt,
  };
}

function normalizeExamAnnouncement(value: unknown): ExamAnnouncement | null {
  if (!isRecord(value)) {
    return null;
  }

  const text = asString(value.text).trim();

  if (!text) {
    return null;
  }

  return {
    text,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  };
}

function normalizePassedTestStudent(value: unknown): PassedTestStudent | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const image = asString(value.image);

  if (!id || !image) {
    return null;
  }

  return {
    id,
    image,
    alt: asOptionalString(value.alt),
    name: asOptionalString(value.name),
    caption: asOptionalString(value.caption),
    date: asOptionalString(value.date),
    dateAdded: asOptionalString(value.dateAdded),
    objectPosition: asOptionalString(value.objectPosition),
  };
}

export function normalizeEditableContent(value: unknown): EditableContent {
  if (!isRecord(value)) {
    return emptyEditableContent;
  }

  return {
    version: typeof value.version === "number" ? value.version : 1,
    lastPublishedAt: typeof value.lastPublishedAt === "string" ? value.lastPublishedAt : null,
    recentEvents: Array.isArray(value.recentEvents)
      ? value.recentEvents.map(normalizeRecentEvent).filter((event): event is RecentEvent => Boolean(event))
      : [],
    examAnnouncement: normalizeExamAnnouncement(value.examAnnouncement),
    historyMedia: normalizeMediaList(value.historyMedia),
    onTheMatMedia: normalizeMediaList(value.onTheMatMedia),
    passedTestStudents: Array.isArray(value.passedTestStudents)
      ? value.passedTestStudents
          .map(normalizePassedTestStudent)
          .filter((student): student is PassedTestStudent => Boolean(student))
      : [],
  };
}

export async function loadEditableContent() {
  try {
    const response = await fetch(assetPath("/content/editableContent.json"), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      return emptyEditableContent;
    }

    return normalizeEditableContent(await response.json());
  } catch {
    return emptyEditableContent;
  }
}

export function useEditableContent() {
  const [content, setContent] = useState<EditableContent>(emptyEditableContent);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    loadEditableContent().then((nextContent) => {
      if (!ignore) {
        setContent(nextContent);
        setLoading(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, []);

  return { content, loading };
}

export function getPublishedRecentEvents(content: EditableContent, limit?: number) {
  const events = content.recentEvents
    .filter((event) => event.published)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  return typeof limit === "number" ? events.slice(0, limit) : events;
}
