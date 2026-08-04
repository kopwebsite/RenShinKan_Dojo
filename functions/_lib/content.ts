import { isCanonicalDate } from "../../shared/date";
import {
  GALLERY_IDS,
  migrateLegacyGalleries,
  syncLegacyGalleryArrays,
  type GalleryAlbum,
  type GalleryAlbums,
  type GalleryId,
  type GalleryPhoto,
} from "../../shared/gallery";
import {
  NEWSLETTER_CATEGORIES,
  inferNewsletterCategory,
  isDocumentDerivedImage,
  type NewsletterCategory,
  type NewsletterContentType,
  type NewsletterDocument,
  type NewsletterDocumentMark,
  type NewsletterDocumentNode,
  type NewsletterEmailSettings,
  type NewsletterEventDetails,
  type NewsletterLifecycleStatus,
  type NewsletterFormat,
  type NewsletterPresentation,
} from "../../shared/newsletter";

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
  bodyContent?: NewsletterDocument;
  slug: string;
  slugHistory?: string[];
  published: boolean;
  websitePublishRequested?: boolean;
  publishedAt?: string | null;
  publishAt?: string | null;
  contentType?: NewsletterContentType;
  category?: NewsletterCategory;
  tags?: string[];
  lifecycleStatus?: NewsletterLifecycleStatus;
  newsletterFormat?: NewsletterFormat;
  presentation?: NewsletterPresentation;
  archivedAt?: string | null;
  trashedAt?: string | null;
  featured?: boolean;
  coverImageId?: string | null;
  relatedNewsletterIds?: string[];
  emailSettings?: NewsletterEmailSettings;
  eventDetails?: NewsletterEventDetails;
  image?: MediaItem;
  media?: MediaItem[];
  notifySubscribers?: boolean;
  showInCommunityCalendar?: boolean;
  calendar?: {
    status: "not_added" | "published" | "failed";
    publishedAt?: string | null;
    error?: string | null;
  };
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
  galleryAlbums: GalleryAlbums;
  sitePages: SitePage[];
  siteSettings: SiteSettings;
};

const allowedNewsletterStatuses = new Set<NewsletterStatus>(["not_sent", "pending", "sent", "failed"]);
const allowedNewsletterCategories = new Set<NewsletterCategory>(NEWSLETTER_CATEGORIES);
const allowedNewsletterContentTypes = new Set<NewsletterContentType>(["newsletter", "event"]);
const allowedNewsletterLifecycleStatuses = new Set<NewsletterLifecycleStatus>(["active", "archived", "trash"]);
const allowedNewsletterFormats = new Set<NewsletterFormat>(["article", "presentation"]);
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

function galleryText(value: unknown, max: number) {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max)
    : "";
}

function galleryId(value: unknown, fallback: string) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{4,120}$/.test(value) ? value : fallback;
}

function galleryDate(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  return isCanonicalDate(value) ? value : undefined;
}

function validateGalleryPhoto(value: unknown, path: string): GalleryPhoto {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  const id = galleryId(value.id, crypto.randomUUID());
  const src = typeof value.src === "string" ? value.src.trim() : "";
  const thumbnailSrc = typeof value.thumbnailSrc === "string" ? value.thumbnailSrc.trim() : "";
  if (!src || (!/^pending:upload-[a-f0-9-]+$/i.test(src) && !safeInternalOrHttpsUrl(src))) {
    throw new Error(`${path}.src must be a safe website or HTTPS image URL`);
  }
  if (thumbnailSrc && !/^pending:upload-[a-f0-9-]+$/i.test(thumbnailSrc) && !safeInternalOrHttpsUrl(thumbnailSrc)) {
    throw new Error(`${path}.thumbnailSrc must be a safe website or HTTPS image URL`);
  }
  const objectPosition = typeof value.objectPosition === "string" && /^\d{1,3}% \d{1,3}%$/.test(value.objectPosition)
    ? value.objectPosition
    : "50% 50%";
  return {
    id,
    src,
    ...(thumbnailSrc ? { thumbnailSrc } : {}),
    ...(typeof value.avif === "string" && safeInternalOrHttpsUrl(value.avif) ? { avif: value.avif } : {}),
    ...(typeof value.webp === "string" && safeInternalOrHttpsUrl(value.webp) ? { webp: value.webp } : {}),
    alt: galleryText(value.alt, 300),
    ...(galleryText(value.caption, 1_000) ? { caption: galleryText(value.caption, 1_000) } : {}),
    objectPosition,
    ...(typeof value.width === "number" && value.width > 0 && value.width <= 10_000 ? { width: Math.round(value.width) } : {}),
    ...(typeof value.height === "number" && value.height > 0 && value.height <= 10_000 ? { height: Math.round(value.height) } : {}),
    ...(typeof value.sha256 === "string" && /^[a-f0-9]{64}$/i.test(value.sha256) ? { sha256: value.sha256.toLowerCase() } : {}),
    visibility: value.visibility === "hidden" ? "hidden" : "published",
    ...(typeof value.createdAt === "string" ? { createdAt: value.createdAt.slice(0, 40) } : {}),
    ...(typeof value.updatedAt === "string" ? { updatedAt: value.updatedAt.slice(0, 40) } : {}),
    ...(typeof value.trashedAt === "string" ? { trashedAt: value.trashedAt.slice(0, 40) } : {}),
  };
}

function validateGalleryAlbum(value: unknown, expectedGalleryId: GalleryId, index: number): GalleryAlbum {
  if (!isRecord(value)) throw new Error(`galleryAlbums.${expectedGalleryId}[${index}] must be an object`);
  const path = `galleryAlbums.${expectedGalleryId}[${index}]`;
  const photos = Array.isArray(value.photos)
    ? value.photos.slice(0, 2_000).map((photo, photoIndex) => validateGalleryPhoto(photo, `${path}.photos[${photoIndex}]`))
    : [];
  const photoIds = new Set<string>();
  for (const photo of photos) {
    if (photoIds.has(photo.id)) throw new Error(`${path} contains duplicate photo id ${photo.id}`);
    photoIds.add(photo.id);
  }
  const title = galleryText(value.title, 160);
  if (!title) throw new Error(`${path}.title is required`);
  return {
    id: galleryId(value.id, crypto.randomUUID()),
    galleryId: expectedGalleryId,
    title,
    ...(galleryDate(value.date) ? { date: galleryDate(value.date) } : {}),
    ...(galleryText(value.description, 2_000) ? { description: galleryText(value.description, 2_000) } : {}),
    ...(typeof value.coverPhotoId === "string" && photoIds.has(value.coverPhotoId) ? { coverPhotoId: value.coverPhotoId } : {}),
    visibility: value.visibility === "draft" || value.visibility === "hidden" ? value.visibility : "published",
    order: index,
    ...(typeof value.createdAt === "string" ? { createdAt: value.createdAt.slice(0, 40) } : {}),
    ...(typeof value.updatedAt === "string" ? { updatedAt: value.updatedAt.slice(0, 40) } : {}),
    photos,
  };
}

export function validateGalleryAlbums(value: unknown, legacy: Pick<EditableContent, "historyMedia" | "onTheMatMedia" | "passedTestStudents">): GalleryAlbums {
  const migrated = migrateLegacyGalleries({ ...legacy, galleryAlbums: value });
  return Object.fromEntries(GALLERY_IDS.map((id) => [
    id,
    migrated[id].slice(0, 200).map((album, index) => validateGalleryAlbum(album, id, index)),
  ])) as GalleryAlbums;
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

function cleanNewsletterText(value: unknown, max: number) {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, max)
    : "";
}

function cleanNewsletterIdentifier(value: unknown) {
  const clean = cleanNewsletterText(value, 140).trim();
  return /^[A-Za-z0-9_-]{1,140}$/.test(clean) ? clean : "";
}

function cleanNewsletterSlug(value: unknown) {
  const clean = cleanNewsletterText(value, 160).trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean) ? clean : "";
}

function validateNewsletterMark(value: unknown, path: string): NewsletterDocumentMark {
  if (!isRecord(value) || (value.type !== "bold" && value.type !== "italic" && value.type !== "link")) {
    throw new Error(`${path} contains an unsupported text style`);
  }
  if (value.type !== "link") return { type: value.type };
  const href = isRecord(value.attrs) ? safeInternalOrHttpsUrl(value.attrs.href, 800) : "";
  if (!href) throw new Error(`${path}.attrs.href must be a safe website or HTTPS URL`);
  return { type: "link", attrs: { href } };
}

function validateNewsletterDocument(value: unknown, path = "bodyContent"): NewsletterDocument | undefined {
  if (value == null) return undefined;
  let nodeCount = 0;
  let textLength = 0;
  const visit = (nodeValue: unknown, nodePath: string, depth: number): NewsletterDocumentNode => {
    if (!isRecord(nodeValue) || typeof nodeValue.type !== "string") throw new Error(`${nodePath} must be a document node`);
    if (depth > 16) throw new Error(`${path} is nested too deeply`);
    nodeCount += 1;
    if (nodeCount > 5_000) throw new Error(`${path} contains too many blocks`);
    const allowedTypes = new Set<NewsletterDocumentNode["type"]>([
      "doc", "paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "horizontalRule", "hardBreak", "text",
    ]);
    if (!allowedTypes.has(nodeValue.type as NewsletterDocumentNode["type"])) {
      throw new Error(`${nodePath}.type is not supported`);
    }
    const type = nodeValue.type as NewsletterDocumentNode["type"];
    const node: NewsletterDocumentNode = { type };
    if (type === "text") {
      const text = cleanNewsletterText(nodeValue.text, 60_000 - textLength);
      textLength += text.length;
      if (textLength > 60_000) throw new Error(`${path} is too long`);
      node.text = text;
      if (Array.isArray(nodeValue.marks)) {
        node.marks = nodeValue.marks.slice(0, 8).map((mark, index) => validateNewsletterMark(mark, `${nodePath}.marks[${index}]`));
      }
      return node;
    }
    if (type === "heading") {
      const level = isRecord(nodeValue.attrs) && (nodeValue.attrs.level === 2 || nodeValue.attrs.level === 3)
        ? nodeValue.attrs.level
        : 2;
      node.attrs = { level };
    } else if (type === "paragraph") {
      const variant = isRecord(nodeValue.attrs) && nodeValue.attrs.variant === "cta" ? "cta" : "default";
      node.attrs = { variant };
    }
    if (Array.isArray(nodeValue.content)) {
      node.content = nodeValue.content.slice(0, 1_000).map((child, index) => visit(child, `${nodePath}.content[${index}]`, depth + 1));
    }
    return node;
  };
  const document = visit(value, path, 0);
  if (document.type !== "doc") throw new Error(`${path} must begin with a document node`);
  return document as NewsletterDocument;
}

function cleanNewsletterTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((tag) => cleanNewsletterText(tag, 40).trim()).filter(Boolean))].slice(0, 10);
}

function cleanRelatedNewsletterIds(value: unknown, ownId: string) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanNewsletterIdentifier).filter((id) => id && id !== ownId))].slice(0, 3);
}

function validateEmailSettings(value: unknown, title: string, summary: string): NewsletterEmailSettings {
  const settings = isRecord(value) ? value : {};
  const replyTo = cleanNewsletterText(settings.replyTo, 254).trim();
  return {
    subject: cleanNewsletterText(settings.subject, 200).trim() || title,
    previewText: cleanNewsletterText(settings.previewText, 240).trim() || summary,
    senderName: cleanNewsletterText(settings.senderName, 120).trim() || "RenShinKan Dojo",
    replyTo: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo) ? replyTo : "",
  };
}

function validateEventDetails(value: unknown): NewsletterEventDetails {
  const details = isRecord(value) ? value : {};
  return {
    startAt: cleanNewsletterText(details.startAt, 40).trim(),
    endAt: cleanNewsletterText(details.endAt, 40).trim(),
    location: cleanNewsletterText(details.location, 300).trim(),
    registrationUrl: safeInternalOrHttpsUrl(details.registrationUrl, 800),
  };
}

function validatePresentation(value: unknown, media: MediaItem[], title: string): NewsletterPresentation {
  const presentation = isRecord(value) ? value : {};
  const originalMediaId = cleanNewsletterIdentifier(presentation.originalMediaId);
  const pdfMediaId = cleanNewsletterIdentifier(presentation.pdfMediaId);
  const validOriginal = media.some((item) => item.id === originalMediaId && item.type === "document" && item.documentKind === "ppt");
  const validPdf = media.some((item) => item.id === pdfMediaId && item.type === "document" && item.documentKind === "pdf");
  const slideCount = Number(presentation.slideCount);
  return {
    originalMediaId: validOriginal ? originalMediaId : null,
    pdfMediaId: validPdf ? pdfMediaId : null,
    viewerTitle: cleanNewsletterText(presentation.viewerTitle, 240).trim() || title,
    slideCount: Number.isInteger(slideCount) && slideCount >= 1 && slideCount <= 999 ? slideCount : null,
    outline: Array.isArray(presentation.outline)
      ? presentation.outline.map((item) => cleanNewsletterText(item, 240).trim()).filter(Boolean).slice(0, 100)
      : [],
  };
}

function validateRecentEvent(value: unknown, index: number): RecentEvent {
  const path = `recentEvents[${index}]`;

  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  const id = cleanNewsletterIdentifier(value.id) || `untitled-newsletter-${index + 1}`;
  const title = cleanNewsletterText(value.title, 240).trim();
  const date = cleanNewsletterText(value.date, 32).trim();
  const summary = cleanNewsletterText(value.summary, 1_000).trim();
  const body = cleanNewsletterText(value.body, 60_000).trim();
  const bodyContent = validateNewsletterDocument(value.bodyContent, `${path}.bodyContent`);
  const slug = cleanNewsletterSlug(value.slug);
  const createdAt = cleanNewsletterText(value.createdAt, 40).trim() || "1970-01-01T00:00:00.000Z";
  const updatedAt = cleanNewsletterText(value.updatedAt, 40).trim() || createdAt;

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

  const explicitCoverId = cleanNewsletterIdentifier(value.coverImageId);
  const coverImageId = explicitCoverId && media.some((item) => item.id === explicitCoverId && item.type === "image")
    ? explicitCoverId
    : image?.type === "image" && !isDocumentDerivedImage(image)
      ? image.id
      : null;
  const contentType = allowedNewsletterContentTypes.has(value.contentType as NewsletterContentType)
    ? value.contentType as NewsletterContentType
    : value.showInCommunityCalendar === true
      ? "event"
      : "newsletter";
  const category = allowedNewsletterCategories.has(value.category as NewsletterCategory)
    ? value.category as NewsletterCategory
    : inferNewsletterCategory(title);
  const lifecycleStatus = allowedNewsletterLifecycleStatuses.has(value.lifecycleStatus as NewsletterLifecycleStatus)
    ? value.lifecycleStatus as NewsletterLifecycleStatus
    : "active";
  const newsletterFormat = allowedNewsletterFormats.has(value.newsletterFormat as NewsletterFormat)
    ? value.newsletterFormat as NewsletterFormat
    : undefined;

  return {
    id,
    title,
    date,
    summary,
    body,
    bodyContent,
    slug,
    slugHistory: Array.isArray(value.slugHistory)
      ? [...new Set(value.slugHistory.map(cleanNewsletterSlug).filter((entry) => entry && entry !== slug))].slice(0, 20)
      : [],
    published: value.published === true,
    websitePublishRequested: value.websitePublishRequested === true || value.published === true,
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt.slice(0, 40) : null,
    publishAt: typeof value.publishAt === "string" ? value.publishAt.slice(0, 40) : null,
    contentType,
    category,
    tags: cleanNewsletterTags(value.tags),
    lifecycleStatus,
    newsletterFormat,
    presentation: validatePresentation(value.presentation, media, title),
    archivedAt: typeof value.archivedAt === "string" ? value.archivedAt.slice(0, 40) : null,
    trashedAt: typeof value.trashedAt === "string" ? value.trashedAt.slice(0, 40) : null,
    featured: value.featured === true,
    coverImageId,
    relatedNewsletterIds: cleanRelatedNewsletterIds(value.relatedNewsletterIds, id),
    emailSettings: validateEmailSettings(value.emailSettings, title, summary),
    eventDetails: validateEventDetails(value.eventDetails),
    image,
    media,
    notifySubscribers: value.notifySubscribers === true,
    showInCommunityCalendar: value.showInCommunityCalendar === true,
    calendar: isRecord(value.calendar)
      ? {
          status: value.calendar.status === "published" || value.calendar.status === "failed" ? value.calendar.status : "not_added",
          publishedAt: typeof value.calendar.publishedAt === "string" ? value.calendar.publishedAt.slice(0, 40) : null,
          error: typeof value.calendar.error === "string" ? value.calendar.error.slice(0, 240) : null,
        }
      : {
          status: value.published === true && value.showInCommunityCalendar === true ? "published" : "not_added",
          publishedAt: null,
          error: null,
        },
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

  const legacy = {
    historyMedia: value.historyMedia == null ? [] : validateMediaList(value.historyMedia, "historyMedia"),
    onTheMatMedia: value.onTheMatMedia == null ? [] : validateMediaList(value.onTheMatMedia, "onTheMatMedia"),
    passedTestStudents: Array.isArray(value.passedTestStudents)
      ? value.passedTestStudents.filter(isRecord)
      : [],
  };

  return {
    version: 3,
    lastPublishedAt: typeof value.lastPublishedAt === "string" ? value.lastPublishedAt : null,
    recentEvents: Array.isArray(value.recentEvents)
      ? value.recentEvents.map(validateRecentEvent)
      : [],
    examAnnouncement,
    paymentQr,
    ...legacy,
    galleryAlbums: validateGalleryAlbums(value.galleryAlbums, legacy),
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
  const replaceGalleryPhoto = (photo: GalleryPhoto) => {
    const replace = (src: string | undefined) => {
      if (!src?.startsWith("pending:")) return src;
      return uploadUrlById.get(src.slice("pending:".length)) ?? fallbackUrls.shift();
    };
    const src = replace(photo.src);
    const thumbnailSrc = replace(photo.thumbnailSrc);
    if (!src) throw new Error(`Missing upload file for gallery photo ${photo.id}`);
    return { ...photo, src, ...(thumbnailSrc ? { thumbnailSrc } : {}) };
  };
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
    galleryAlbums: Object.fromEntries(GALLERY_IDS.map((id) => [
      id,
      content.galleryAlbums[id].map((album) => ({ ...album, photos: album.photos.map(replaceGalleryPhoto) })),
    ])) as GalleryAlbums,
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
  GALLERY_IDS.forEach((galleryId) => nextContent.galleryAlbums[galleryId].forEach((album, albumIndex) =>
    album.photos.forEach((photo, photoIndex) => {
      assertNoBlockedMediaSrc(photo.src, `galleryAlbums.${galleryId}[${albumIndex}].photos[${photoIndex}].src`);
      assertNoBlockedMediaSrc(photo.thumbnailSrc, `galleryAlbums.${galleryId}[${albumIndex}].photos[${photoIndex}].thumbnailSrc`);
    })));
  assertNoBlockedMediaSrc(nextContent.paymentQr.src, "paymentQr.src");

  return syncLegacyGalleryArrays(nextContent) as EditableContent;
}
