export type NewsletterStatus = "not_sent" | "pending" | "sent" | "failed";

export type BodyMediaAlign = "left" | "center" | "right";

export type BodyMediaPlacement = {
  position?: number;
  widthPercent?: number;
  align?: BodyMediaAlign;
};

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

export type EditableContent = {
  version: number;
  lastPublishedAt: string | null;
  recentEvents: RecentEvent[];
  examAnnouncement: ExamAnnouncement | null;
  historyMedia: MediaItem[];
  onTheMatMedia: MediaItem[];
  passedTestStudents: PassedTestStudent[];
};
