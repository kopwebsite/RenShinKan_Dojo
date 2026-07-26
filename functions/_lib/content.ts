export type NewsletterStatus = "not_sent" | "pending" | "sent" | "failed";

export type BodyMediaAlign = "left" | "center" | "right";

export type BodyMediaPlacement = {
  position?: number;
  widthPercent?: number;
  align?: BodyMediaAlign;
};

export type DocumentMediaKind = "pdf" | "docx" | "ppt";
export type DocumentDisplayMode = "inline" | "link";

export type MediaItem = {
  id: string;
  src: string;
  avif?: string;
  webp?: string;
  alt: string;
  caption?: string;
  type: "image" | "video" | "document";
  title?: string;
  documentKind?: DocumentMediaKind;
  displayMode?: DocumentDisplayMode;
  fileName?: string;
  fileSize?: number;
  objectPosition?: string;
  width?: number;
  height?: number;
  bodyPlacement?: BodyMediaPlacement;
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
  showInCommunityCalendar?: boolean;
  newsletter?: {
    status: NewsletterStatus;
    sentAt?: string | null;
    brevoCampaignId?: number | string | null;
    error?: string | null;
  };
  createdAt: string;
  updatedAt: string;
};

export const SITE_LOCALES = ["en", "th", "ja", "zh-CN"] as const;
export type SiteLocale = typeof SITE_LOCALES[number];
export type SiteBlockType = "hero" | "richText" | "image" | "imageText" | "gallery" | "schedule"
  | "instructorCard" | "cta" | "contact" | "announcement" | "divider" | "video" | "faq";
export type SiteBlockTranslation = {
  title: string;
  text: string;
  buttonLabel: string;
  buttonUrl: string;
  imageUrl: string;
  imageAlt: string;
};
export type SiteBlock = {
  id: string;
  type: SiteBlockType;
  visible: boolean;
  align: "left" | "center" | "right";
  textColor: "ink" | "paper" | "bamboo" | "vermillion";
  background: "transparent" | "paper" | "mist" | "ink" | "bamboo";
  font: "sans" | "serif";
  fontSize: "small" | "normal" | "large";
  spacing: "compact" | "normal" | "spacious";
  imagePlacement: "left" | "right" | "above";
  translations: Record<SiteLocale, SiteBlockTranslation>;
};
export type SitePage = {
  id: string;
  route: string;
  status: "draft" | "published";
  translations: Record<SiteLocale, { title: string; seoTitle: string; seoDescription: string }>;
  blocks: SiteBlock[];
  publishedAt: string | null;
  publishedBy: string | null;
};
export type SiteSettings = {
  translations: Record<SiteLocale, { footerText: string; notice: string; navigation: Record<string, string> }>;
};

export type EditableContent = {
  version: number;
  lastPublishedAt: string | null;
  recentEvents: RecentEvent[];
  examAnnouncement: { text: string; updatedAt?: string | null } | null;
  paymentQr: { src: string; alt: string; updatedAt?: string | null };
  historyMedia: MediaItem[];
  onTheMatMedia: MediaItem[];
  passedTestStudents: Array<Record<string, unknown>>;
  sitePages: SitePage[];
  siteSettings: SiteSettings;
};

const allowedNewsletterStatuses = new Set<NewsletterStatus>(["not_sent", "pending", "sent", "failed"]);
const allowedBodyMediaAligns = new Set<BodyMediaAlign>(["left", "center", "right"]);
const allowedDocumentKinds = new Set<DocumentMediaKind>(["pdf", "docx", "ppt"]);
const allowedDocumentDisplayModes = new Set<DocumentDisplayMode>(["inline", "link"]);
const MAX_RECENT_EVENT_PHOTOS = 6;
const siteBlockTypes = new Set<SiteBlockType>(["hero", "richText", "image", "imageText", "gallery", "schedule", "instructorCard", "cta", "contact", "announcement", "divider", "video", "faq"]);

const emptyBlockTranslation = (): SiteBlockTranslation => ({ title: "", text: "", buttonLabel: "", buttonUrl: "", imageUrl: "", imageAlt: "" });

function safeInternalOrHttpsUrl(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  const clean = value.trim().slice(0, max);
  if (!clean) return "";
  if (clean.startsWith("/") && !clean.startsWith("//") && !/[<>"']/.test(clean)) return clean;
  try { return new URL(clean).protocol === "https:" ? clean : ""; } catch { return ""; }
}

function localizedRecord<T>(value: unknown, normalize: (entry: Record<string, unknown>) => T, fallback: () => T) {
  const record = isRecord(value) ? value : {};
  return Object.fromEntries(SITE_LOCALES.map((locale) => [locale, isRecord(record[locale]) ? normalize(record[locale] as Record<string, unknown>) : fallback()])) as Record<SiteLocale, T>;
}

function validateSiteBlock(value: unknown, index: number): SiteBlock {
  if (!isRecord(value)) throw new Error(`site block ${index + 1} must be an object`);
  const type = siteBlockTypes.has(value.type as SiteBlockType) ? value.type as SiteBlockType : null;
  if (!type) throw new Error(`site block ${index + 1} has an unsupported type`);
  const id = typeof value.id === "string" && /^[A-Za-z0-9_-]{4,100}$/.test(value.id) ? value.id : crypto.randomUUID();
  const translations = localizedRecord(value.translations, (entry) => ({
    title: typeof entry.title === "string" ? entry.title.slice(0, 200) : "",
    text: typeof entry.text === "string" ? entry.text.slice(0, 12_000) : "",
    buttonLabel: typeof entry.buttonLabel === "string" ? entry.buttonLabel.slice(0, 100) : "",
    buttonUrl: safeInternalOrHttpsUrl(entry.buttonUrl),
    imageUrl: safeInternalOrHttpsUrl(entry.imageUrl),
    imageAlt: typeof entry.imageAlt === "string" ? entry.imageAlt.slice(0, 300) : "",
  }), emptyBlockTranslation);
  return {
    id, type, visible: value.visible !== false,
    align: value.align === "center" || value.align === "right" ? value.align : "left",
    textColor: value.textColor === "paper" || value.textColor === "bamboo" || value.textColor === "vermillion" ? value.textColor : "ink",
    background: value.background === "paper" || value.background === "mist" || value.background === "ink" || value.background === "bamboo" ? value.background : "transparent",
    font: value.font === "serif" ? "serif" : "sans",
    fontSize: value.fontSize === "small" || value.fontSize === "large" ? value.fontSize : "normal",
    spacing: value.spacing === "compact" || value.spacing === "spacious" ? value.spacing : "normal",
    imagePlacement: value.imagePlacement === "right" || value.imagePlacement === "above" ? value.imagePlacement : "left",
    translations,
  };
}

function validateSitePage(value: unknown, index: number): SitePage {
  if (!isRecord(value)) throw new Error(`sitePages[${index}] must be an object`);
  const route = typeof value.route === "string" ? value.route.trim().replace(/\/$/, "") || "/" : "/";
  if (!/^\/(?:[a-z0-9-]+)?$/.test(route) || route.startsWith("/admin")) throw new Error(`sitePages[${index}].route is invalid`);
  const translations = localizedRecord(value.translations, (entry) => ({
    title: typeof entry.title === "string" ? entry.title.slice(0, 200) : "",
    seoTitle: typeof entry.seoTitle === "string" ? entry.seoTitle.slice(0, 70) : "",
    seoDescription: typeof entry.seoDescription === "string" ? entry.seoDescription.slice(0, 180) : "",
  }), () => ({ title: "", seoTitle: "", seoDescription: "" }));
  return {
    id: typeof value.id === "string" && /^[A-Za-z0-9_-]{4,100}$/.test(value.id) ? value.id : crypto.randomUUID(),
    route,
    status: value.status === "published" ? "published" : "draft",
    translations,
    blocks: Array.isArray(value.blocks) ? value.blocks.slice(0, 80).map(validateSiteBlock) : [],
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : null,
    publishedBy: typeof value.publishedBy === "string" ? value.publishedBy.slice(0, 120) : null,
  };
}

function validateSiteSettings(value: unknown): SiteSettings {
  const record = isRecord(value) ? value : {};
  return { translations: localizedRecord(record.translations, (entry) => {
    const navigation = isRecord(entry.navigation) ? Object.fromEntries(Object.entries(entry.navigation)
      .filter((item): item is [string, string] => /^[a-zA-Z0-9_-]{1,80}$/.test(item[0]) && typeof item[1] === "string")
      .map(([key, label]) => [key, label.slice(0, 100)])) : {};
    return {
      footerText: typeof entry.footerText === "string" ? entry.footerText.slice(0, 1_000) : "",
      notice: typeof entry.notice === "string" ? entry.notice.slice(0, 500) : "",
      navigation,
    };
  }, () => ({ footerText: "", notice: "", navigation: {} })) };
}

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

function validateBodyMediaPlacement(value: unknown): BodyMediaPlacement | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const position = optionalNumber(value, "position");
  const widthPercent = optionalNumber(value, "widthPercent");
  const align = allowedBodyMediaAligns.has(value.align as BodyMediaAlign)
    ? value.align as BodyMediaAlign
    : undefined;

  return {
    position: position == null ? undefined : Math.max(0, Math.round(position)),
    widthPercent: widthPercent == null ? undefined : Math.min(Math.max(Math.round(widthPercent), 25), 100),
    align,
  };
}

function isValidEmbedUrl(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith("<iframe")) {
    const match = trimmed.match(/src=["']([^"']+)["']/i);
    return match ? isValidEmbedUrl(match[1]) : false;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");
    const isEmbedPath =
      url.pathname.includes("/embed/") ||
      url.pathname.includes("/video/") ||
      url.pathname.includes("/player/");
    const isVimeoPage = host === "vimeo.com" && /^\/\d+/.test(url.pathname);

    return (
      url.protocol === "https:" &&
      (isEmbedPath ||
        host === "youtube.com" ||
        host === "youtu.be" ||
        isVimeoPage ||
        host === "player.vimeo.com" ||
        host.endsWith(".youtube.com"))
    );
  } catch {
    return false;
  }
}

function validateMediaItem(value: unknown, path: string): MediaItem {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  const id = requireString(value, "id").trim();
  const src = requireString(value, "src").trim();
  const type =
    value.type === "video" || value.type === "image" || value.type === "document"
      ? value.type
      : null;

  if (!id) {
    throw new Error(`${path}.id is required`);
  }

  if (!src) {
    throw new Error(`${path}.src is required`);
  }

  if (!type) {
    throw new Error(`${path}.type must be image, video, or document`);
  }

  if (type === "video" && !isValidEmbedUrl(src)) {
    throw new Error(`${path}.src must be a supported HTTPS video embed URL`);
  }

  if (type === "document" && !allowedDocumentKinds.has(value.documentKind as DocumentMediaKind)) {
    throw new Error(`${path}.documentKind must be pdf, docx, or ppt`);
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
    documentKind: type === "document" ? value.documentKind as DocumentMediaKind : undefined,
    displayMode:
      type === "document" && allowedDocumentDisplayModes.has(value.displayMode as DocumentDisplayMode)
        ? value.displayMode as DocumentDisplayMode
        : undefined,
    fileName: type === "document" ? optionalString(value, "fileName") : undefined,
    fileSize: type === "document" ? optionalNumber(value, "fileSize") : undefined,
    objectPosition: optionalString(value, "objectPosition"),
    width: optionalNumber(value, "width"),
    height: optionalNumber(value, "height"),
    bodyPlacement: validateBodyMediaPlacement(value.bodyPlacement),
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
  const photoCount = new Set(
    [...media, ...(image ? [image] : [])]
      .filter((item) => item.type === "image")
      .map((item) => item.id || item.src),
  ).size;

  if (photoCount > MAX_RECENT_EVENT_PHOTOS) {
    throw new Error(`${path}.media can include at most ${MAX_RECENT_EVENT_PHOTOS} photos`);
  }

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
    showInCommunityCalendar: value.showInCommunityCalendar === true,
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
  const paymentQr = isRecord(value.paymentQr)
    ? {
        src: typeof value.paymentQr.src === "string" && /^pending:upload-[a-f0-9-]+$/i.test(value.paymentQr.src)
          ? value.paymentQr.src
          : safeInternalOrHttpsUrl(value.paymentQr.src) || "/images/promptpay-qr.png",
        alt: typeof value.paymentQr.alt === "string"
          ? value.paymentQr.alt.trim().slice(0, 300) || "PromptPay QR code for RenShinKan Dojo"
          : "PromptPay QR code for RenShinKan Dojo",
        updatedAt: typeof value.paymentQr.updatedAt === "string" ? value.paymentQr.updatedAt : null,
      }
    : {
        src: "/images/promptpay-qr.png",
        alt: "PromptPay QR code for RenShinKan Dojo",
        updatedAt: null,
      };

  return {
    version: 1,
    lastPublishedAt: typeof value.lastPublishedAt === "string" ? value.lastPublishedAt : null,
    recentEvents: Array.isArray(value.recentEvents)
      ? value.recentEvents.map(validateRecentEvent)
      : [],
    examAnnouncement,
    paymentQr,
    historyMedia: value.historyMedia == null ? [] : validateMediaList(value.historyMedia, "historyMedia"),
    onTheMatMedia: value.onTheMatMedia == null ? [] : validateMediaList(value.onTheMatMedia, "onTheMatMedia"),
    passedTestStudents: Array.isArray(value.passedTestStudents)
      ? value.passedTestStudents.filter(isRecord)
      : [],
    sitePages: Array.isArray(value.sitePages) ? value.sitePages.slice(0, 40).map(validateSitePage) : [],
    siteSettings: validateSiteSettings(value.siteSettings),
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
  const paymentQrSrc = content.paymentQr.src.startsWith("pending:")
    ? uploadUrlById.get(content.paymentQr.src.slice("pending:".length)) ?? fallbackUrls.shift()
    : content.paymentQr.src;
  if (!paymentQrSrc) {
    throw new Error("Missing upload file for payment QR");
  }
  const nextContent: EditableContent = {
    ...content,
    paymentQr: { ...content.paymentQr, src: paymentQrSrc },
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
  assertNoBlockedMediaSrc(nextContent.paymentQr.src, "paymentQr.src");

  return nextContent;
}
