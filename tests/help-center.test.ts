import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { getAdminHelpCatalog } from "../src/help/content/admin";
import { getPublicHelpCatalog } from "../src/help/content/public";
import { suggestedHelpArticles } from "../src/help/context";
import { searchHelpArticles } from "../src/help/search";

const publicLocales = ["en", "th", "ja", "zh-CN"] as const;
const adminLocales = ["en", "th"] as const;

describe("help center content contracts", () => {
  it("uses structured React content without a help-specific DOM mutation adapter", () => {
    const sources = [
      "src/help/HelpLauncher.tsx",
      "src/help/HelpPanel.tsx",
      "src/help/content/public.ts",
      "src/help/content/admin.ts",
    ]
      .map((path) => readFileSync(resolve(path), "utf8"))
      .join("\n");
    expect(sources).not.toContain("MutationObserver");
  });

  it("ships the same complete public topic set in all four locales", () => {
    const english = getPublicHelpCatalog("en");
    expect(english.articles).toHaveLength(10);
    const expectedIds = english.articles.map((article) => article.id).sort();
    for (const locale of publicLocales) {
      const catalog = getPublicHelpCatalog(locale);
      expect(catalog.articles.map((article) => article.id).sort()).toEqual(
        expectedIds,
      );
      for (const article of catalog.articles) {
        expect(article).toMatchObject({
          audience: "public",
          locale,
          version: "2026.07",
        });
        expect(article.routes.length).toBeGreaterThan(0);
        expect(article.summary.length).toBeGreaterThan(20);
        expect(article.steps.length).toBeGreaterThanOrEqual(3);
        expect(article.troubleshooting.length).toBeGreaterThan(0);
        expect(article.keywords.length).toBeGreaterThan(2);
      }
    }
    for (const locale of publicLocales.filter((value) => value !== "en")) {
      const localized = getPublicHelpCatalog(locale);
      localized.articles.forEach((article, index) => {
        expect(article.title).not.toBe(english.articles[index].title);
        expect(article.summary).not.toBe(english.articles[index].summary);
      });
    }
  });

  it("ships complete English and Thai Auggie admin topics with strict audience separation", () => {
    const expectedIds = getAdminHelpCatalog("en")
      .articles.map((article) => article.id)
      .sort();
    expect(expectedIds).toHaveLength(11);
    for (const locale of adminLocales) {
      const catalog = getAdminHelpCatalog(locale);
      expect(catalog.articles.map((article) => article.id).sort()).toEqual(
        expectedIds,
      );
      expect(catalog.ui.heading).toContain("Auggie");
      expect(catalog.ui.guideDescription).toMatch(
        locale === "th" ? /ไม่ใช่บุคคล/ : /not a person/,
      );
      catalog.articles.forEach((article) => {
        expect(article.audience).toBe("admin");
        expect(article.locale).toBe(locale);
        expect(article.id.startsWith("admin-")).toBe(true);
        expect(article.steps).toHaveLength(3);
      });
    }
    expect(getAdminHelpCatalog("en").ui.trigger).toBe("Open Auggie help");
    expect(getAdminHelpCatalog("en").ui.heading).toBe("Auggie — Admin help");
  });

  it("covers the required student and administration workflows", () => {
    const publicText = JSON.stringify(getPublicHelpCatalog("en"));
    for (const term of [
      "profile",
      "training",
      "eligibility",
      "payment proof",
      "receipt",
      "digital passport",
      "revoke",
      "newsletter",
      "download",
      "website problem",
    ]) {
      expect(publicText.toLowerCase()).toContain(term);
    }
    const adminText = JSON.stringify(getAdminHelpCatalog("en"));
    for (const term of [
      "verification",
      "data scope",
      "dashboard",
      "archive",
      "duplicate",
      "certificate",
      "retry publish",
      "alt text",
      "public downloads",
      "least privilege",
      "audit history",
    ]) {
      expect(adminText.toLowerCase()).toContain(term);
    }
  });

  it("searches localized content, including unsegmented Thai queries", () => {
    expect(
      searchHelpArticles(getPublicHelpCatalog("th").articles, "ชั่วโมงฝึก").map(
        (article) => article.id,
      ),
    ).toContain("public-training");
    expect(
      searchHelpArticles(getPublicHelpCatalog("ja").articles, "パスポート").map(
        (article) => article.id,
      ),
    ).toContain("public-passport");
    expect(
      searchHelpArticles(
        getPublicHelpCatalog("zh-CN").articles,
        "付款凭证",
      ).map((article) => article.id),
    ).toContain("public-payments");
    expect(
      searchHelpArticles(getAdminHelpCatalog("th").articles, "เผยแพร่").map(
        (article) => article.id,
      ),
    ).toContain("admin-newsletters");
    expect(
      searchHelpArticles(
        getPublicHelpCatalog("en").articles,
        "no such workflow",
      ),
    ).toEqual([]);
  });

  it("returns route-aware suggestions without crossing audience boundaries", () => {
    const publicCatalog = getPublicHelpCatalog("en");
    const student = suggestedHelpArticles(
      "public",
      "/student-records",
      publicCatalog.articles,
    );
    expect(student[0].id).toBe("public-profile");
    expect(student.every((article) => article.audience === "public")).toBe(
      true,
    );
    const adminCatalog = getAdminHelpCatalog("en");
    const payments = suggestedHelpArticles(
      "admin",
      "/admin/payment-proofs",
      adminCatalog.articles,
    );
    expect(payments[0].id).toBe("admin-payments");
    expect(payments.every((article) => article.audience === "admin")).toBe(
      true,
    );
  });

  it("keeps every related topic valid inside its catalog", () => {
    for (const catalog of [
      ...publicLocales.map(getPublicHelpCatalog),
      ...adminLocales.map(getAdminHelpCatalog),
    ]) {
      const ids = new Set(catalog.articles.map((article) => article.id));
      catalog.articles.forEach((article) =>
        article.related.forEach((id) =>
          expect(ids.has(id), `${article.id} -> ${id}`).toBe(true),
        ),
      );
    }
  });
});

describe("help screenshot manifest", () => {
  const manifestPath = resolve("public/help/screenshots/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    schemaVersion: number;
    reviewDate: string;
    buildId: string;
    dataPolicy: string;
    items: Array<{
      file: string;
      topicId: string;
      route: string;
      locale: string;
      viewport: { width: number; height: number };
      testedAt: string;
      buildId: string;
      alt: string;
    }>;
  };

  it("records route, locale, viewport, test date, build, alt text, and review metadata", () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.reviewDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(manifest.buildId.length).toBeGreaterThanOrEqual(7);
    expect(manifest.dataPolicy).toMatch(/No production student/i);
    expect(manifest.items).toHaveLength(6);
    manifest.items.forEach((item) => {
      expect(item.route).toMatch(/^\//);
      expect(["en", "th"]).toContain(item.locale);
      expect(item.viewport.width).toBeGreaterThanOrEqual(390);
      expect(item.viewport.height).toBeGreaterThanOrEqual(800);
      expect(item.testedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(item.buildId).toBe(manifest.buildId);
      expect(item.alt.length).toBeGreaterThan(20);
    });
  });

  it("contains optimized local WebP assets and no private fixture values", async () => {
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toMatch(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
    expect(serialized).not.toMatch(/\b\d{10,13}\b/);
    for (const item of manifest.items) {
      const path = resolve("public/help/screenshots", item.file);
      expect(existsSync(path), item.file).toBe(true);
      expect(statSync(path).size).toBeLessThan(400_000);
      const metadata = await sharp(path).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBe(item.viewport.width);
      expect(metadata.height).toBe(item.viewport.height);
    }
    const catalogScreenshots = [
      ...publicLocales.map(getPublicHelpCatalog),
      ...adminLocales.map(getAdminHelpCatalog),
    ].flatMap((catalog) =>
      catalog.articles.flatMap((article) => article.screenshots),
    );
    manifest.items.forEach((item) => {
      const screenshot = catalogScreenshots.find((candidate) =>
        candidate.src.endsWith(item.file),
      );
      expect(screenshot?.alt).toBe(item.alt);
    });
  });
});
