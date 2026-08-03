export const NEWSLETTER_CATEGORIES = [
  "Dojo News",
  "Training and Classes",
  "Belt Examinations",
  "Events",
  "Community",
  "Workshops",
] as const;

export type NewsletterCategory = typeof NEWSLETTER_CATEGORIES[number];
export type NewsletterContentType = "newsletter" | "event";
export type NewsletterLifecycleStatus = "active" | "archived" | "trash";
export type NewsletterFormat = "article" | "presentation";
export type NewsletterPresentation = {
  originalMediaId: string | null;
  pdfMediaId: string | null;
  viewerTitle: string;
  slideCount: number | null;
  outline: string[];
};

export type NewsletterDocumentMark = {
  type: "bold" | "italic" | "link";
  attrs?: { href?: string };
};

export type NewsletterDocumentNode = {
  type:
    | "doc"
    | "paragraph"
    | "heading"
    | "bulletList"
    | "orderedList"
    | "listItem"
    | "blockquote"
    | "horizontalRule"
    | "hardBreak"
    | "text";
  attrs?: {
    level?: number;
    variant?: "default" | "cta";
  };
  content?: NewsletterDocumentNode[];
  marks?: NewsletterDocumentMark[];
  text?: string;
};

export type NewsletterDocument = NewsletterDocumentNode & { type: "doc" };

export type NewsletterEmailSettings = {
  subject: string;
  previewText: string;
  senderName: string;
  replyTo: string;
};

export type NewsletterEventDetails = {
  startAt: string;
  endAt: string;
  location: string;
  registrationUrl: string;
};

export type NewsletterLike = {
  id: string;
  title: string;
  date: string;
  summary: string;
  body: string;
  slug: string;
  published: boolean;
  publishedAt?: string | null;
  publishAt?: string | null;
  contentType?: NewsletterContentType;
  category?: NewsletterCategory;
  tags?: string[];
  lifecycleStatus?: NewsletterLifecycleStatus;
  newsletterFormat?: NewsletterFormat;
  presentation?: NewsletterPresentation;
  relatedNewsletterIds?: string[];
  featured?: boolean;
  media?: Array<{
    id: string;
    type: string;
    src: string;
    title?: string;
    fileName?: string;
    alt?: string;
    objectPosition?: string;
    documentKind?: "pdf" | "docx" | "ppt";
  }>;
  image?: {
    id: string;
    type: string;
    src: string;
    title?: string;
    fileName?: string;
    alt?: string;
    objectPosition?: string;
    documentKind?: "pdf" | "docx" | "ppt";
  };
  coverImageId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RelatedNewsletterRecommendation<T extends NewsletterLike> = {
  newsletter: T;
  reason: "Selected by the dojo" | "More in this category" | "Related topic" | "Recent from the dojo";
};

function normalizedWords(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function inferNewsletterCategory(title: string): NewsletterCategory {
  const value = normalizedWords(title);
  if (/\b(belt|exam|examination|grading|promotion)\b/.test(value)) return "Belt Examinations";
  if (/\b(workshop|seminar|clinic)\b/.test(value)) return "Workshops";
  if (/\b(event|demonstration|open day|gathering)\b/.test(value)) return "Events";
  if (/\b(class|training|practice|schedule|beginner)\b/.test(value)) return "Training and Classes";
  if (/\b(community|visit|foundation|university)\b/.test(value)) return "Community";
  return "Dojo News";
}

export function isDocumentDerivedImage(value: { src?: string; title?: string; fileName?: string } | null | undefined) {
  const searchable = normalizedWords([value?.src, value?.title, value?.fileName].filter(Boolean).join(" "));
  return /\b(application|form|document|pdf|registration|worksheet)\b/.test(searchable);
}

export function publicNewsletter<T extends NewsletterLike>(newsletter: T, now = new Date()) {
  if (!newsletter.published || (newsletter.lifecycleStatus ?? "active") !== "active") return false;
  if (!newsletter.title.trim() || !newsletter.slug.trim()) return false;
  if (newsletter.publishAt) {
    const publishAt = Date.parse(newsletter.publishAt);
    if (Number.isFinite(publishAt) && publishAt > now.getTime()) return false;
  }
  return true;
}

export function newsletterCover<T extends NewsletterLike>(newsletter: T) {
  const media = newsletter.media ?? [];
  const explicit = newsletter.coverImageId
    ? media.find((item) => item.id === newsletter.coverImageId && item.type === "image")
    : undefined;
  if (explicit) return explicit;

  const legacy = newsletter.image?.type === "image" ? newsletter.image : undefined;
  return legacy && !isDocumentDerivedImage(legacy) ? legacy : undefined;
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortNewslettersNewest<T extends NewsletterLike>(items: T[]) {
  return [...items].sort((left, right) => {
    const dateDifference = timestamp(right.publishedAt || right.publishAt || right.date)
      - timestamp(left.publishedAt || left.publishAt || left.date);
    if (dateDifference !== 0) return dateDifference;
    const updatedDifference = timestamp(right.updatedAt) - timestamp(left.updatedAt);
    if (updatedDifference !== 0) return updatedDifference;
    return left.id.localeCompare(right.id);
  });
}

export function relatedNewsletterRecommendations<T extends NewsletterLike>(
  allNewsletters: T[],
  current: T,
  limit = 3,
  now = new Date(),
): RelatedNewsletterRecommendation<T>[] {
  const eligible = sortNewslettersNewest(
    allNewsletters.filter((item) => item.id !== current.id && publicNewsletter(item, now)),
  );
  const byId = new Map(eligible.map((item) => [item.id, item]));
  const selected = new Set<string>();
  const recommendations: RelatedNewsletterRecommendation<T>[] = [];
  const add = (newsletter: T | undefined, reason: RelatedNewsletterRecommendation<T>["reason"]) => {
    if (!newsletter || selected.has(newsletter.id) || recommendations.length >= limit) return;
    selected.add(newsletter.id);
    recommendations.push({ newsletter, reason });
  };

  for (const id of current.relatedNewsletterIds ?? []) add(byId.get(id), "Selected by the dojo");
  for (const item of eligible) {
    if (item.category === current.category && item.category) add(item, "More in this category");
  }

  const tags = new Set((current.tags ?? []).map((tag) => normalizedWords(tag)).filter(Boolean));
  for (const item of eligible) {
    if ((item.tags ?? []).some((tag) => tags.has(normalizedWords(tag)))) add(item, "Related topic");
  }
  for (const item of eligible) add(item, "Recent from the dojo");

  return recommendations;
}

export function newsletterReadingMinutes(newsletter: Pick<NewsletterLike, "body"> & { bodyContent?: NewsletterDocument }) {
  const structuredText = newsletter.bodyContent
    ? collectNewsletterDocumentText(newsletter.bodyContent)
    : "";
  const wordCount = normalizedWords(structuredText || newsletter.body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 220));
}

export function collectNewsletterDocumentText(node: NewsletterDocumentNode): string {
  const ownText = node.type === "text" ? node.text ?? "" : "";
  return [ownText, ...(node.content ?? []).map(collectNewsletterDocumentText)].filter(Boolean).join(" ");
}

export function newsletterPublicationIssues(
  newsletter: NewsletterLike & {
    bodyContent?: NewsletterDocument;
    eventDetails?: NewsletterEventDetails;
    category?: NewsletterCategory;
  },
) {
  const issues: string[] = [];
  if (!newsletter.title.trim()) issues.push("Add a title.");
  if (!newsletter.summary.trim()) issues.push("Add a short summary.");
  if (!newsletter.category) issues.push("Choose a category.");
  if (!newsletter.slug.trim()) issues.push("Create a web address.");
  if (!newsletter.date.trim()) issues.push("Choose a publication or event date.");
  if (newsletter.newsletterFormat === "presentation") {
    const media = newsletter.media ?? [];
    const original = media.find((item) => item.id === newsletter.presentation?.originalMediaId);
    const pdf = media.find((item) => item.id === newsletter.presentation?.pdfMediaId);
    if (!original || original.type !== "document" || original.documentKind !== "ppt") issues.push("Upload the original PowerPoint presentation.");
    if (!pdf || pdf.type !== "document" || pdf.documentKind !== "pdf") issues.push("Upload the PDF presentation for the website viewer.");
    if (!newsletter.presentation?.slideCount || newsletter.presentation.slideCount < 1) issues.push("Enter the total number of slides.");
  } else if (!newsletter.body.trim() && !collectNewsletterDocumentText(newsletter.bodyContent ?? { type: "doc" }).trim()) {
    issues.push("Write the newsletter.");
  }
  if (newsletter.contentType === "event" && newsletter.eventDetails && !newsletter.eventDetails.startAt && !newsletter.date) {
    issues.push("Add the event date.");
  }
  return issues;
}
