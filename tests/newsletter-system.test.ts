import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  newsletterCover,
  publicNewsletter,
  relatedNewsletterRecommendations,
  sortNewslettersNewest,
  type NewsletterLike,
} from "../shared/newsletter";
import { validateEditableContent } from "../functions/_lib/content";
import { renderNewsletterCampaignHtml } from "../functions/_lib/brevo";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (path: string) => readFileSync(resolve(root, path), "utf8");

function contentWith(recentEvents: unknown[]) {
  return {
    version: 1,
    lastPublishedAt: null,
    recentEvents,
    examAnnouncement: null,
    paymentQr: { src: "/images/promptpay-qr.png", alt: "QR" },
    historyMedia: [],
    onTheMatMedia: [],
    passedTestStudents: [],
    sitePages: [],
    siteSettings: {},
  };
}

function legacyEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-legacy-one",
    title: "Belt Examination on June 28, 2026",
    date: "2026-06-28",
    summary: "A grading announcement for dojo members.",
    body: "Please review the examination details before attending.",
    slug: "upcoming-belt-examination-june-28-2026",
    published: true,
    image: {
      id: "application-form-image",
      src: "/media/examination-application-form.png",
      alt: "Examination application form",
      type: "image",
    },
    media: [
      {
        id: "application-form-image",
        src: "/media/examination-application-form.png",
        alt: "Examination application form",
        type: "image",
      },
      {
        id: "application-pdf",
        src: "/media/examination-application.pdf",
        alt: "",
        type: "document",
        documentKind: "pdf",
        title: "Examination application",
      },
    ],
    notifySubscribers: true,
    showInCommunityCalendar: true,
    newsletter: {
      status: "sent",
      sentAt: "2026-06-07T08:00:00.000Z",
      brevoCampaignId: 71,
      error: null,
    },
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-06-07T08:00:00.000Z",
    ...overrides,
  };
}

function recommendationEvent(
  id: string,
  overrides: Partial<NewsletterLike> = {},
): NewsletterLike {
  return {
    id,
    title: `Newsletter ${id}`,
    date: "2026-06-01",
    summary: "Summary",
    body: "Body",
    slug: `newsletter-${id}`,
    published: true,
    category: "Dojo News",
    tags: [],
    lifecycleStatus: "active",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("newsletter migration and backward compatibility", () => {
  it("preserves identity, delivery, calendar, media, and empty legacy drafts without inventing publication", () => {
    const migrated = validateEditableContent(contentWith([
      legacyEvent(),
      legacyEvent({
        id: "event-empty-draft",
        title: "",
        date: "",
        summary: "",
        body: "",
        slug: "",
        published: false,
        image: undefined,
        media: [],
        notifySubscribers: false,
        showInCommunityCalendar: false,
        newsletter: undefined,
      }),
    ]));
    const event = migrated.recentEvents[0];
    expect(migrated.version).toBe(3);
    expect(event.id).toBe("event-legacy-one");
    expect(event.slug).toBe("upcoming-belt-examination-june-28-2026");
    expect(event.newsletter).toMatchObject({
      status: "sent",
      sentAt: "2026-06-07T08:00:00.000Z",
      brevoCampaignId: 71,
    });
    expect(event.calendar?.status).toBe("published");
    expect(event.media).toHaveLength(2);
    expect(event.coverImageId).toBeNull();
    expect(newsletterCover(event)).toBeUndefined();
    expect(migrated.recentEvents[1]).toMatchObject({
      id: "event-empty-draft",
      title: "",
      published: false,
      lifecycleStatus: "active",
    });
  });

  it("accepts only structured allowlisted content and safe links", () => {
    expect(() => validateEditableContent(contentWith([
      legacyEvent({
        bodyContent: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Safe text", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }],
        },
      }),
    ]))).toThrow(/safe website or HTTPS URL/);

    expect(() => validateEditableContent(contentWith([
      legacyEvent({
        bodyContent: { type: "doc", content: [{ type: "rawHtml", text: "<script>alert(1)</script>" }] },
      }),
    ]))).toThrow(/not supported/);
  });

  it("never makes future, archived, trashed, draft, empty, or obvious test content public", () => {
    const now = new Date("2026-06-15T00:00:00.000Z");
    expect(publicNewsletter(recommendationEvent("public"), now)).toBe(true);
    expect(publicNewsletter(recommendationEvent("future", { publishAt: "2026-07-01T00:00:00.000Z" }), now)).toBe(false);
    expect(publicNewsletter(recommendationEvent("archived", { lifecycleStatus: "archived" }), now)).toBe(false);
    expect(publicNewsletter(recommendationEvent("trash", { lifecycleStatus: "trash" }), now)).toBe(false);
    expect(publicNewsletter(recommendationEvent("draft", { published: false }), now)).toBe(false);
    expect(publicNewsletter(recommendationEvent("test", { title: "DSADSADSA", slug: "d" }), now)).toBe(false);
    expect(publicNewsletter(recommendationEvent("test-one", { title: "Test 1", slug: "t" }), now)).toBe(false);
    expect(publicNewsletter(recommendationEvent("test-two", { title: "Test newsletter 2", slug: "test-newsletter-2" }), now)).toBe(false);
  });
});

describe("related-newsletter and scalable archive behavior", () => {
  it("preserves manual order, fills by category then tags then recency, and removes duplicates", () => {
    const current = recommendationEvent("current", {
      category: "Belt Examinations",
      tags: ["grading", "children"],
      relatedNewsletterIds: ["manual-two", "manual-one", "draft"],
    });
    const all = [
      current,
      recommendationEvent("manual-one", { date: "2026-02-01" }),
      recommendationEvent("manual-two", { date: "2026-01-01" }),
      recommendationEvent("category", { category: "Belt Examinations", date: "2026-05-01" }),
      recommendationEvent("tag", { category: "Community", tags: ["grading"], date: "2026-06-01" }),
      recommendationEvent("recent", { category: "Community", date: "2026-07-01" }),
      recommendationEvent("draft", { published: false }),
      recommendationEvent("trashed", { lifecycleStatus: "trash" }),
    ];
    expect(relatedNewsletterRecommendations(all, current).map(({ newsletter, reason }) => [newsletter.id, reason])).toEqual([
      ["manual-two", "Selected by the dojo"],
      ["manual-one", "Selected by the dojo"],
      ["category", "More in this category"],
    ]);
    expect(relatedNewsletterRecommendations(all, current, 5).map(({ newsletter }) => newsletter.id)).toEqual([
      "manual-two",
      "manual-one",
      "category",
      "tag",
      "recent",
    ]);
  });

  it("sorts deterministic zero, one, two, and many published collections", () => {
    expect(sortNewslettersNewest([])).toEqual([]);
    expect(sortNewslettersNewest([recommendationEvent("one")]).map((item) => item.id)).toEqual(["one"]);
    expect(sortNewslettersNewest([
      recommendationEvent("old", { date: "2025-01-01" }),
      recommendationEvent("new", { date: "2026-01-01" }),
    ]).map((item) => item.id)).toEqual(["new", "old"]);
    const many = Array.from({ length: 45 }, (_, index) =>
      recommendationEvent(String(index).padStart(2, "0"), { date: `2026-${String((index % 12) + 1).padStart(2, "0")}-01` }));
    expect(sortNewslettersNewest(many)).toHaveLength(45);
    expect(new Set(sortNewslettersNewest(many).map((item) => item.id)).size).toBe(45);
  });
});

describe("publishing, delivery, privacy, and interface safety contracts", () => {
  it("uses an additive immutable-delivery migration with a one-delivery guard", () => {
    const migration = file("migrations/0019_newsletter_delivery_safety.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS newsletter_deliveries");
    expect(migration).toContain("snapshot_json TEXT NOT NULL");
    expect(migration).toContain("html_content TEXT NOT NULL");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_deliveries_one_active");
    expect(migration).toContain("WHERE status IN ('pending', 'created', 'sent', 'pending_verification')");
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/i);
  });

  it("requires central authorization, same origin, recipient-count reconfirmation, and idempotency before sending", () => {
    const send = file("functions/api/admin/newsletters/send.ts");
    for (const contract of [
      "getAuthorizedAdminSession",
      "requiresCentralAdmin",
      "isSameOriginRequest",
      "confirmedRecipientCount",
      "idempotencyKey",
      "existingDelivery",
      "pending_verification",
      "recipientCountChanged",
      "snapshot_json",
      "html_content",
    ]) expect(send).toContain(contract);
    expect(send.indexOf("INSERT INTO newsletter_deliveries")).toBeLessThan(send.indexOf("await createRecentEventCampaign"));
    expect(file("functions/api/admin/publish.ts")).not.toContain("sendRecentEventCampaignNow");
    expect(file("functions/api/admin/publish.ts")).toContain("newsletter_send_deferred");
  });

  it("keeps subscriber identities server-side and logs only a verified test address domain", () => {
    const status = file("functions/api/admin/newsletters/status.ts");
    const test = file("functions/api/admin/newsletters/test.ts");
    expect(status).toContain("recipientCount");
    expect(status).not.toContain("contacts:");
    expect(test).toContain("recipientDomain");
    expect(test).not.toContain("newValues: { campaignId, email");
  });

  it("renders exact escaped email snapshots and omits the website button for email-only newsletters", () => {
    const emailOnly = validateEditableContent(contentWith([
      legacyEvent({
        title: "Summer training <schedule>",
        published: false,
        body: "Practice & progress.",
        showInCommunityCalendar: false,
        newsletter: { status: "not_sent" },
      }),
    ])).recentEvents[0];
    const unpublishedHtml = renderNewsletterCampaignHtml({
      SITE_URL: "https://renshinkandojo.org",
      BREVO_API_KEY: "test",
      BREVO_LIST_ID: "1",
      BREVO_SENDER_EMAIL: "dojo@example.com",
    }, emailOnly);
    expect(unpublishedHtml).toContain("Summer training &lt;schedule&gt;");
    expect(unpublishedHtml).not.toContain("Read the full post");
    const publishedHtml = renderNewsletterCampaignHtml({
      SITE_URL: "https://renshinkandojo.org",
      BREVO_API_KEY: "test",
      BREVO_LIST_ID: "1",
      BREVO_SENDER_EMAIL: "dojo@example.com",
    }, { ...emailOnly, published: true });
    expect(publishedHtml).toContain("Read the full post");
    expect(publishedHtml).toContain("/newsletter/upcoming-belt-examination-june-28-2026");
  });

  it("implements one-at-a-time administration, five sections, autosave recovery, previews, and bounded pagination", () => {
    const admin = file("src/components/admin/AdminNewsletterManager.tsx");
    for (const value of [
      "Newsletters and updates",
      "What are you creating?",
      "Basic information",
      "Write the newsletter",
      "Images and attachments",
      "Choose where it appears",
      "Review and publish",
      "Unsaved changes",
      "Could not save",
      "Subscriber email preview",
      "Final subscriber confirmation",
      "Email delivery cannot be undone",
    ]) expect(admin).toContain(value);
    expect(admin).toContain("const ADMIN_PAGE_SIZE = 20");
    expect(admin).toContain("LOCAL_BACKUP_PREFIX");
    expect(admin).toContain("beforeunload");
    expect(admin).toContain("focusableSelector");
    expect(file("src/pages/AdminPage.tsx")).toContain("<AdminNewsletterManager");
  });

  it("implements a nine-item crawlable archive, homepage module, rich article SEO, and dynamic sitemap", () => {
    const archive = file("src/pages/NewsletterPage.tsx");
    const homepage = file("src/pages/DojoPage.tsx");
    const sitemap = file("functions/sitemap.xml.ts");
    expect(archive).toContain("const PAGE_SIZE = 9");
    expect(archive).toContain("aria-label=\"Newsletter archive pages\"");
    expect(archive).toContain("More from RenShinKan");
    expect(archive).toContain("\"@type\": \"BreadcrumbList\"");
    expect(archive).toContain("rel=\"canonical\"");
    expect(homepage.indexOf("<LatestDojoNewsletters")).toBeLessThan(homepage.indexOf("<DojoPageSections"));
    expect(sitemap).toContain("publicNewsletter(event)");
    expect(sitemap).toContain("/newsletter/${event.slug}");
  });
});
