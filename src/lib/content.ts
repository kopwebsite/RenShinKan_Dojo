import { useEffect, useState } from "react";
import { migrateLegacyGalleries } from "../../shared/gallery";
import type {
  BodyMediaPlacement,
  DocumentDisplayMode,
  DocumentMediaKind,
  EditableContent,
  ExamAnnouncement,
  MediaItem,
  NewsletterStatus,
  PaymentQr,
  PassedTestStudent,
  RecentEvent,
  SiteBlock,
  SiteBlockTranslation,
  SiteLocale,
  SitePage,
  SiteSettings,
} from "../types/editableContent";
import { SITE_LOCALES } from "../types/editableContent";
import { assetPath } from "../utils/assetPath";
import {
  clampBodyMediaPosition,
  clampBodyMediaWidth,
  normalizeBodyMediaAlign,
} from "../utils/eventBody";
import { isValidEmbedUrl } from "../utils/mediaEmbeds";

export const emptyEditableContent: EditableContent = {
  version: 2,
  lastPublishedAt: null,
  recentEvents: [],
  examAnnouncement: null,
  paymentQr: {
    src: "/images/promptpay-qr.png",
    alt: "PromptPay QR code for RenShinKan Dojo",
    updatedAt: null,
  },
  historyMedia: [],
  onTheMatMedia: [],
  passedTestStudents: [],
  galleryAlbums: {
    "on-the-mat": [],
    history: [],
    achievements: [],
  },
  sitePages: [],
  siteSettings: {
    translations: Object.fromEntries(SITE_LOCALES.map((locale) => [locale, { footerText: "", notice: "", navigation: {} }])) as SiteSettings["translations"],
  },
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

function normalizeBodyMediaPlacement(value: unknown): BodyMediaPlacement | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    position:
      typeof value.position === "number" && Number.isFinite(value.position)
        ? clampBodyMediaPosition(value.position, Number.MAX_SAFE_INTEGER)
        : undefined,
    widthPercent: clampBodyMediaWidth(value.widthPercent),
    align: normalizeBodyMediaAlign(value.align),
  };
}

function normalizeNewsletterStatus(value: unknown): NewsletterStatus {
  return value === "pending" || value === "sent" || value === "failed" ? value : "not_sent";
}

function normalizeDocumentKind(value: unknown): DocumentMediaKind | undefined {
  return value === "pdf" || value === "docx" || value === "ppt" ? value : undefined;
}

function normalizeDocumentDisplayMode(value: unknown): DocumentDisplayMode | undefined {
  return value === "inline" || value === "link" ? value : undefined;
}

function normalizeMediaItem(value: unknown): MediaItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const src = asString(value.src);
  const type = value.type === "video" || value.type === "document" ? value.type : "image";

  if (!id || !src) {
    return null;
  }

  if (type === "video" && !isValidEmbedUrl(src)) {
    return null;
  }

  const documentKind = type === "document" ? normalizeDocumentKind(value.documentKind) : undefined;

  if (type === "document" && !documentKind) {
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
    documentKind,
    displayMode: type === "document" ? normalizeDocumentDisplayMode(value.displayMode) : undefined,
    fileName: type === "document" ? asOptionalString(value.fileName) : undefined,
    fileSize: type === "document" ? asOptionalNumber(value.fileSize) : undefined,
    objectPosition: asOptionalString(value.objectPosition),
    width: asOptionalNumber(value.width),
    height: asOptionalNumber(value.height),
    bodyPlacement: normalizeBodyMediaPlacement(value.bodyPlacement),
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
    showInCommunityCalendar: value.showInCommunityCalendar === true,
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

function normalizePaymentQr(value: unknown): PaymentQr {
  if (!isRecord(value)) {
    return emptyEditableContent.paymentQr;
  }
  const src = asString(value.src).trim();
  return {
    src: src || emptyEditableContent.paymentQr.src,
    alt: asString(value.alt).trim() || emptyEditableContent.paymentQr.alt,
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

function localizedRecord<T>(value: unknown, normalize: (entry: RecordValue) => T, fallback: () => T) {
  const record = isRecord(value) ? value : {};
  return Object.fromEntries(SITE_LOCALES.map((locale) => [locale, isRecord(record[locale]) ? normalize(record[locale] as RecordValue) : fallback()])) as Record<SiteLocale, T>;
}

function normalizeSiteBlock(value: unknown): SiteBlock | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.type !== "string") return null;
  const validTypes = ["hero", "richText", "image", "imageText", "gallery", "schedule", "instructorCard", "cta", "contact", "announcement", "divider", "video", "faq"];
  if (!validTypes.includes(value.type)) return null;
  const translations = localizedRecord<SiteBlockTranslation>(value.translations, (entry) => ({
    title: asString(entry.title), text: asString(entry.text), buttonLabel: asString(entry.buttonLabel),
    buttonUrl: asString(entry.buttonUrl), imageUrl: asString(entry.imageUrl), imageAlt: asString(entry.imageAlt),
  }), () => ({ title: "", text: "", buttonLabel: "", buttonUrl: "", imageUrl: "", imageAlt: "" }));
  return {
    id: value.id, type: value.type as SiteBlock["type"], visible: value.visible !== false,
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

function normalizeSitePage(value: unknown): SitePage | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.route !== "string") return null;
  return {
    id: value.id, route: value.route, status: value.status === "published" ? "published" : "draft",
    translations: localizedRecord(value.translations, (entry) => ({ title: asString(entry.title), seoTitle: asString(entry.seoTitle), seoDescription: asString(entry.seoDescription) }), () => ({ title: "", seoTitle: "", seoDescription: "" })),
    blocks: Array.isArray(value.blocks) ? value.blocks.map(normalizeSiteBlock).filter((block): block is SiteBlock => Boolean(block)) : [],
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : null,
    publishedBy: typeof value.publishedBy === "string" ? value.publishedBy : null,
  };
}

function normalizeSiteSettings(value: unknown): SiteSettings {
  const record = isRecord(value) ? value : {};
  return { translations: localizedRecord(record.translations, (entry) => ({
    footerText: asString(entry.footerText), notice: asString(entry.notice),
    navigation: isRecord(entry.navigation) ? Object.fromEntries(Object.entries(entry.navigation).filter((item): item is [string, string] => typeof item[1] === "string")) : {},
  }), () => ({ footerText: "", notice: "", navigation: {} })) };
}

export function normalizeEditableContent(value: unknown): EditableContent {
  if (!isRecord(value)) {
    return emptyEditableContent;
  }

  const normalizedLegacy = {
    historyMedia: normalizeMediaList(value.historyMedia),
    onTheMatMedia: normalizeMediaList(value.onTheMatMedia),
    passedTestStudents: Array.isArray(value.passedTestStudents)
      ? value.passedTestStudents
          .map(normalizePassedTestStudent)
          .filter((student): student is PassedTestStudent => Boolean(student))
      : [],
  };

  return {
    version: typeof value.version === "number" ? value.version : 1,
    lastPublishedAt: typeof value.lastPublishedAt === "string" ? value.lastPublishedAt : null,
    recentEvents: Array.isArray(value.recentEvents)
      ? value.recentEvents.map(normalizeRecentEvent).filter((event): event is RecentEvent => Boolean(event))
      : [],
    examAnnouncement: normalizeExamAnnouncement(value.examAnnouncement),
    paymentQr: normalizePaymentQr(value.paymentQr),
    ...normalizedLegacy,
    galleryAlbums: migrateLegacyGalleries({ ...normalizedLegacy, galleryAlbums: value.galleryAlbums }),
    sitePages: Array.isArray(value.sitePages) ? value.sitePages.map(normalizeSitePage).filter((page): page is SitePage => Boolean(page)) : [],
    siteSettings: normalizeSiteSettings(value.siteSettings),
  };
}

async function fetchEditableContent(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return normalizeEditableContent(await response.json());
}

function isViteLocalHost() {
  if (typeof window === "undefined") {
    return false;
  }

  return ["5173", "4173"].includes(window.location.port);
}

let sharedContentRequest: Promise<EditableContent> | null = null;

async function fetchFirstEditableContent() {
  const staticContentUrl = assetPath("/content/editableContent.json");
  const urls = isViteLocalHost() ? [staticContentUrl] : ["/api/content", staticContentUrl];

  for (const url of urls) {
    try {
      const content = await fetchEditableContent(url);

      if (content) {
        return content;
      }
    } catch {
      // Try the next source. Vite dev does not run Cloudflare Pages Functions.
    }
  }

  return emptyEditableContent;
}

export function loadEditableContent() {
  sharedContentRequest ||= fetchFirstEditableContent();
  return sharedContentRequest;
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
    .filter((event) => {
      if (!event.published) return false;
      const compactTitle = event.title.replace(/[^a-z0-9]/gi, "");
      const looksLikeTestContent = compactTitle.length < 5 || /^(test|draft|sample|dsadsadsa|asdf)+$/i.test(compactTitle);
      return !looksLikeTestContent;
    })
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  return typeof limit === "number" ? events.slice(0, limit) : events;
}

export function getCommunityCalendarEvents(content: EditableContent) {
  return content.recentEvents
    .filter((event) => event.published && event.showInCommunityCalendar === true)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}
