import { test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const outputDirectory = resolve("public/help/screenshots");
const manifestPath = resolve(outputDirectory, "manifest.json");

async function prepare(
  page: Page,
  route: string,
  locale: "en" | "th" = "en",
  viewport = { width: 1280, height: 800 },
) {
  await page.setViewportSize(viewport);
  await page.addInitScript(
    ({ publicLocale, adminLocale }) => {
      localStorage.setItem("rsk-lang", publicLocale);
      localStorage.setItem("rsk-admin-lang", adminLocale);
    },
    { publicLocale: locale, adminLocale: locale },
  );
  await page.goto(route, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.addStyleTag({
    content:
      ".help-launcher{visibility:hidden!important}*{caret-color:transparent!important}",
  });
  await page.waitForTimeout(700);
}

async function badge(
  page: Page,
  selector: string,
  label: string,
  edge: "left" | "right" = "left",
) {
  const target = page.locator(selector).first();
  if ((await target.count()) === 0) return;
  const box = await target.boundingBox({ timeout: 2_000 });
  if (!box) return;
  await page.evaluate(
    ({ x, y, label: number }) => {
      const marker = document.createElement("span");
      marker.textContent = number;
      marker.setAttribute("aria-hidden", "true");
      Object.assign(marker.style, {
        position: "fixed",
        left: `${x}px`,
        top: `${y}px`,
        zIndex: "2147483647",
        width: "30px",
        height: "30px",
        display: "grid",
        placeItems: "center",
        border: "3px solid white",
        borderRadius: "50%",
        color: "white",
        background: "#7c2433",
        boxShadow: "0 2px 8px #0008",
        font: "800 15px/1 system-ui",
      });
      document.body.append(marker);
    },
    {
      x: Math.max(4, edge === "right" ? box.x + box.width - 24 : box.x - 8),
      y: Math.max(4, box.y - 8),
      label,
    },
  );
}

async function capture(page: Page, file: string) {
  await page.screenshot({
    path: resolve(outputDirectory, file),
    type: "webp",
    quality: 82,
    animations: "disabled",
  });
}

test("capture controlled help screenshots", async ({ page }) => {
  mkdirSync(outputDirectory, { recursive: true });

  await prepare(page, "/");
  await badge(page, "header nav", "1");
  await badge(page, '[aria-label="Language selector"]', "2", "right");
  await capture(page, "public-home-en-desktop-v2026-07.webp");

  await prepare(page, "/student-records", "en", { width: 390, height: 844 });
  await badge(page, "main form", "1");
  await badge(page, 'button[type="submit"]', "2", "right");
  await capture(page, "student-records-en-mobile-v2026-07.webp");

  await prepare(page, "/newsletter");
  await badge(page, "main h1", "1");
  await badge(page, "main article", "2");
  await capture(page, "newsletter-en-desktop-v2026-07.webp");

  await prepare(page, "/downloads");
  await badge(page, "main h1", "1");
  await badge(page, "main a", "2", "right");
  await capture(page, "downloads-en-desktop-v2026-07.webp");

  await prepare(page, "/admin");
  await badge(page, "main form", "1");
  await badge(page, 'main button[type="submit"]', "2", "right");
  await capture(page, "admin-login-en-desktop-v2026-07.webp");

  await prepare(page, "/admin", "th");
  await badge(page, "main form", "1");
  await badge(page, 'main button[type="submit"]', "2", "right");
  await capture(page, "admin-login-th-desktop-v2026-07.webp");

  const build = (await page.request
    .get("/build.json")
    .then((response) => response.json())) as { buildId: string };
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    buildId: string;
    reviewDate: string;
    items: Array<{ buildId: string; testedAt: string }>;
  };
  const testedAt = new Date().toISOString().slice(0, 10);
  manifest.buildId = build.buildId;
  manifest.reviewDate = testedAt;
  manifest.items = manifest.items.map((item) => ({
    ...item,
    buildId: build.buildId,
    testedAt,
  }));
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
});
