import type { GalleryAlbums } from "../../shared/gallery";

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

export type ExamAnnouncement = {
  text: string;
  updatedAt?: string | null;
};

export type PaymentQr = {
  src: string;
  alt: string;
  updatedAt?: string | null;
};

export type PassedTestStudent = {
  id: string;
  image: string;
  alt?: string;
  name?: string;
  caption?: string;
  date?: string;
  dateAdded?: string;
  objectPosition?: string;
};

export const SITE_LOCALES = ["en", "th", "ja", "zh-CN"] as const;
export type SiteLocale = typeof SITE_LOCALES[number];
export type SiteBlockType = "hero" | "richText" | "image" | "imageText" | "gallery" | "schedule"
  | "instructorCard" | "cta" | "contact" | "announcement" | "divider" | "video" | "faq";
export type SiteBlockTranslation = { title: string; text: string; buttonLabel: string; buttonUrl: string; imageUrl: string; imageAlt: string };
export type SiteBlock = {
  id: string; type: SiteBlockType; visible: boolean; align: "left" | "center" | "right";
  textColor: "ink" | "paper" | "bamboo" | "vermillion"; background: "transparent" | "paper" | "mist" | "ink" | "bamboo";
  font: "sans" | "serif"; fontSize: "small" | "normal" | "large"; spacing: "compact" | "normal" | "spacious";
  imagePlacement: "left" | "right" | "above"; translations: Record<SiteLocale, SiteBlockTranslation>;
};
export type SitePage = {
  id: string; route: string; status: "draft" | "published";
  translations: Record<SiteLocale, { title: string; seoTitle: string; seoDescription: string }>;
  blocks: SiteBlock[]; publishedAt: string | null; publishedBy: string | null;
};
export type SiteSettings = { translations: Record<SiteLocale, { footerText: string; notice: string; navigation: Record<string, string> }> };

export type EditableContent = {
  version: number;
  lastPublishedAt: string | null;
  recentEvents: RecentEvent[];
  examAnnouncement: ExamAnnouncement | null;
  paymentQr: PaymentQr;
  historyMedia: MediaItem[];
  onTheMatMedia: MediaItem[];
  passedTestStudents: PassedTestStudent[];
  galleryAlbums: GalleryAlbums;
  sitePages: SitePage[];
  siteSettings: SiteSettings;
};
