import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function file(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("search indexing boundaries", () => {
  it("sets server-level noindex headers on every private route family", () => {
    const headers = file("public/_headers");
    for (const route of [
      "/admin",
      "/admin/*",
      "/student-records",
      "/records",
      "/records/*",
      "/api/*",
    ]) {
      const block = headers.slice(headers.indexOf(`\n${route}\n`));
      expect(block.slice(0, block.indexOf("\n\n"))).toContain(
        "X-Robots-Tag: noindex, nofollow",
      );
    }
  });

  it("keeps only canonical public routes in the sitemap and crawler allowlist", () => {
    const sitemap = file("functions/sitemap.xml.ts");
    const robots = file("public/robots.txt");
    for (const route of [
      "/aikido",
      "/instructors",
      "/classes",
      "/workshops",
      "/newsletter",
      "/community",
      "/downloads",
      "/support",
      "/contact",
    ])
      expect(sitemap).toContain(`\"${route}\"`);
    for (const route of ["/admin", "/student-records", "/records"])
      expect(sitemap).not.toContain(`\"${route}\"`);
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Disallow: /student-records");
    expect(robots).toContain("Disallow: /records");
    expect(robots).toContain(
      "Sitemap: https://renshinkandojo.org/sitemap.xml",
    );
  });
});
