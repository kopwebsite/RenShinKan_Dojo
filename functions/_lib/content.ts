export type NewsletterStatus = "not_sent" | "pending" | "sent" | "failed";

export type MediaItem = {
  id: string;
  src: string;
  avif?: string;
  webp?: string;
  alt: string;
  caption?: string;
  type: "image" | "video";
  title?: string;
  objectPosition?: string;
  width?: number;
  height?: number;
};

export type RecentEvent = {
  id: string;
  title: string;
  date: string;
  summary: string;
  body: string;
  slug: string;
  published: boolean;
  image?: MediaItem;
  media?: MediaItem[];
  notifySubscribers?: boolean;
  newsletter?: {
    status: NewsletterStatus;
    sentAt?: string | null;
    brevoCampaignId?: number | string | null;
    error?: string | null;
  };
  createdAt: string;
  updatedAt: string;
};

export type EditableContent = {
  version: number;
  lastPublishedAt: string | null;
  recentEvents: RecentEvent[];
  examAnnouncement: { text: string; updatedAt?: string | null } | null;
  historyMedia: MediaItem[];
  onTheMatMedia: MediaItem[];
  passedTestStudents: Array<Record<string, unknown>>;
};

const allowedNewsletterStatuses = new Set<NewsletterStatus>(["not_sent", "pending", "sent", "failed"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string) {
  const value = record[key];

  if (typeof value !== "string") {
    throw new Error(`content.${key} must be a string`);
  }

  return value;
}

function optionalString(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" ? record[key] as string : undefined;
}

function optionalNumber(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "number" && Number.isFinite(record[key]) ? record[key] as number : undefined;
}

function validateMediaItem(value: unknown, path: string): MediaItem {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  const id = requireString(value, "id").trim();
  const src = requireString(value, "src").trim();
  const type = value.type === "video" ? "video" : value.type === "image" ? "image" : null;

  if (!id) {
    throw new Error(`${path}.id is required`);
  }

  if (!src) {
    throw new Error(`${path}.src is required`);
  }

  if (!type) {
    throw new Error(`${path}.type must be image or video`);
  }

  return {
    id,
    src,
    avif: optionalString(value, "avif"),
    webp: optionalString(value, "webp"),
    alt: typeof value.alt === "string" ? value.alt : "",
    caption: optionalString(value, "caption"),
    type,
    title: optionalString(value, "title"),
    objectPosition: optionalString(value, "objectPosition"),
    width: optionalNumber(value, "width"),
    height: optionalNumber(value, "height"),
  };
}

function validateMediaList(value: unknown, path: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }

  return value.map((item, index) => validateMediaItem(item, `${path}[${index}]`));
}

function validateNewsletter(value: unknown) {
  if (!isRecord(value)) {
    return {
      status: "not_sent" as const,
      sentAt: null,
      brevoCampaignId: null,
      error: null,
    };
  }

  const status = allowedNewsletterStatuses.has(value.status as NewsletterStatus)
    ? value.status as NewsletterStatus
    : "not_sent";

  return {
    status,
    sentAt: typeof value.sentAt === "string" ? value.sentAt : null,
    brevoCampaignId:
      typeof value.brevoCampaignId === "number" || typeof value.brevoCampaignId === "string"
        ? value.brevoCampaignId
        : null,
    error: typeof value.error === "string" ? value.error : null,
  };
}

function validateRecentEvent(value: unknown, index: number): RecentEvent {
  const path = `recentEvents[${index}]`;

  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  const id = requireString(value, "id").trim();
  const title = requireString(value, "title").trim();
  const date = requireString(value, "date").trim();
  const summary = requireString(value, "summary").trim();
  const body = requireString(value, "body").trim();
  const slug = requireString(value, "slug").trim();
  const createdAt = requireString(value, "createdAt").trim();
  const updatedAt = requireString(value, "updatedAt").trim();

  if (!id || !title || !date || !slug || !createdAt || !updatedAt) {
    throw new Error(`${path} is missing a required string field`);
  }

  const image = value.image == null ? undefined : validateMediaItem(value.image, `${path}.image`);
  const media = value.media == null ? [] : validateMediaList(value.media, `${path}.media`);

  return {
    id,
    title,
    date,
    summary,
    body,
    slug,
    published: value.published === true,
    image,
    media,
    notifySubscribers: value.notifySubscribers === true,
    newsletter: validateNewsletter(value.newsletter),
    createdAt,
    updatedAt,
  };
}

export function validateEditableContent(value: unknown): EditableContent {
  if (!isRecord(value)) {
    throw new Error("content must be an object");
  }

  const examAnnouncement = value.examAnnouncement == null
    ? null
    : (() => {
        if (!isRecord(value.examAnnouncement)) {
          throw new Error("examAnnouncement must be an object or null");
        }

        return {
          text: typeof value.examAnnouncement.text === "string" ? value.examAnnouncement.text : "",
          updatedAt: typeof value.examAnnouncement.updatedAt === "string" ? value.examAnnouncement.updatedAt : null,
        };
      })();

  return {
    version: 1,
    lastPublishedAt: typeof value.lastPublishedAt === "string" ? value.lastPublishedAt : null,
    recentEvents: Array.isArray(value.recentEvents)
      ? value.recentEvents.map(validateRecentEvent)
      : [],
    examAnnouncement,
    historyMedia: value.historyMedia == null ? [] : validateMediaList(value.historyMedia, "historyMedia"),
    onTheMatMedia: value.onTheMatMedia == null ? [] : validateMediaList(value.onTheMatMedia, "onTheMatMedia"),
    passedTestStudents: Array.isArray(value.passedTestStudents)
      ? value.passedTestStudents.filter(isRecord)
      : [],
  };
}

function replaceMediaSource(item: MediaItem, uploadUrlById: Map<string, string>, fallbackUrls: string[]) {
  if (!item.src.startsWith("pending:")) {
    return item;
  }

  const pendingId = item.src.slice("pending:".length);
  const src = uploadUrlById.get(pendingId) ?? fallbackUrls.shift();

  if (!src) {
    throw new Error(`Missing upload file for ${pendingId}`);
  }

  return {
    ...item,
    src,
    avif: undefined,
    webp: undefined,
  };
}

function replaceMediaList(media: MediaItem[], uploadUrlById: Map<string, string>, fallbackUrls: string[]) {
  return media.map((item) => replaceMediaSource(item, uploadUrlById, fallbackUrls));
}

function assertNoBlockedMediaSrc(src: unknown, path: string) {
  if (typeof src !== "string") {
    return;
  }

  if (/^(blob:|data:|pending:)/i.test(src)) {
    throw new Error(`${path} cannot be stored as ${src.split(":")[0]} URL`);
  }
}

export function replacePendingMediaUrls(content: EditableContent, uploadUrlById: Map<string, string>, fallbackUrls: string[]) {
  const nextContent: EditableContent = {
    ...content,
    recentEvents: content.recentEvents.map((event) => {
      const image = event.image ? replaceMediaSource(event.image, uploadUrlById, fallbackUrls) : undefined;
      const media = replaceMediaList(event.media ?? [], uploadUrlById, fallbackUrls);

      return {
        ...event,
        image,
        media,
      };
    }),
    historyMedia: replaceMediaList(content.historyMedia, uploadUrlById, fallbackUrls),
    onTheMatMedia: replaceMediaList(content.onTheMatMedia, uploadUrlById, fallbackUrls),
    passedTestStudents: content.passedTestStudents.map((student, index) => {
      const image = typeof student.image === "string" && student.image.startsWith("pending:")
        ? uploadUrlById.get(student.image.slice("pending:".length)) ?? fallbackUrls.shift()
        : student.image;

      if (typeof student.image === "string" && student.image.startsWith("pending:") && !image) {
        throw new Error(`Missing upload file for passedTestStudents[${index}]`);
      }

      return {
        ...student,
        image,
      };
    }),
  };

  nextContent.recentEvents.forEach((event, eventIndex) => {
    assertNoBlockedMediaSrc(event.image?.src, `recentEvents[${eventIndex}].image.src`);
    event.media?.forEach((item, mediaIndex) => {
      assertNoBlockedMediaSrc(item.src, `recentEvents[${eventIndex}].media[${mediaIndex}].src`);
    });
  });
  nextContent.historyMedia.forEach((item, index) => assertNoBlockedMediaSrc(item.src, `historyMedia[${index}].src`));
  nextContent.onTheMatMedia.forEach((item, index) => assertNoBlockedMediaSrc(item.src, `onTheMatMedia[${index}].src`));
  nextContent.passedTestStudents.forEach((student, index) => assertNoBlockedMediaSrc(student.image, `passedTestStudents[${index}].image`));

  return nextContent;
}
