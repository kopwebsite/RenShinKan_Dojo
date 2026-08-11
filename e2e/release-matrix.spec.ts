import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

type SmokeCredentials = {
  adminName: string;
  password: string;
  studentName: string;
  studentId: string;
  newsletterCount?: number;
};

const publicRoutes = [
  "/",
  "/aikido",
  "/instructors",
  "/classes",
  "/workshops",
  "/newsletter",
  "/newsletter/capacity-newsletter-0001",
  "/newsletter/capacity-newsletter-0050",
  "/community",
  "/downloads",
  "/support",
  "/contact",
  "/student-records",
  "/release-route-that-does-not-exist",
] as const;

const viewports = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

function credentials() {
  return JSON.parse(
    readFileSync(
      process.env.RSK_E2E_CREDENTIALS_PATH ||
        "tmp/pages-smoke-credentials.json",
      "utf8",
    ),
  ) as SmokeCredentials;
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

async function signInAsSyntheticAdministrator(page: Page) {
  const fixture = credentials();
  await page.goto("/admin");
  const password = page.getByLabel("Administrative password");
  await expect(password).toHaveValue("", { timeout: 30_000 });
  await page.getByLabel("Your name").fill(fixture.adminName);
  const dojo = page.locator("#admin-dojo");
  await expect(dojo).toBeVisible({ timeout: 30_000 });
  await dojo.selectOption("dojo-rsk");
  await password.fill(fixture.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin(?:\/dashboard)?$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
    timeout: 15_000,
  });
  return fixture;
}

test("all public routes render without same-origin failures or runtime errors", async ({
  page,
  baseURL,
}) => {
  const expectedOrigin = new URL(baseURL || "https://localhost:8788").origin;
  for (const path of publicRoutes) {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedResponses: string[] = [];
    const onConsole = (message: { type(): string; text(): string }) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    };
    const onPageError = (error: Error) => pageErrors.push(error.message);
    const onResponse = (response: { status(): number; url(): string }) => {
      const url = new URL(response.url());
      if (url.origin === expectedOrigin && response.status() >= 400) {
        failedResponses.push(`${response.status()} ${url.pathname}`);
      }
    };
    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("response", onResponse);
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), path).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveTitle(/RenShinKan/);
    await page.waitForTimeout(350);
    await expectNoHorizontalOverflow(page);
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
    expect(pageErrors, `${path} page errors`).toEqual([]);
    expect(consoleErrors, `${path} console errors`).toEqual([]);
    expect(failedResponses, `${path} failed same-origin responses`).toEqual([]);
  }
});

test("responsive layouts reflow at every required viewport", async ({
  browser,
  baseURL,
}) => {
  for (const viewport of viewports) {
    for (const path of ["/", "/student-records"] as const) {
      // A fresh page prevents WebKit from restoring the previous document when
      // a viewport change and the next top-level navigation happen together.
      // That browser race can otherwise interrupt page.goto with the URL from
      // the preceding loop even though the layout itself is healthy.
      const context = await browser.newContext({ baseURL, viewport });
      const sample = await context.newPage();
      try {
        const response = await sample.goto(path, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        expect(response?.status(), path).toBeLessThan(400);
        await expect(sample.locator("main")).toBeVisible();
        await expectNoHorizontalOverflow(sample);
      } finally {
        await context.close();
      }
    }
  }
});

test("touch navigation and reduced motion remain functional", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/");
  const menu = page.getByRole("button", { name: /open navigation menu/i });
  await expect(menu).toBeVisible();
  await menu.tap();
  await expect(page.getByRole("navigation", { name: /mobile/i })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await context.close();
});

test("content reflows at 200% and 400% zoom-equivalent widths", async ({
  page,
}) => {
  for (const viewport of [
    { width: 640, height: 900 },
    { width: 320, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/student-records");
    await expect(
      page.getByRole("heading", { name: "Student workspace" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("delayed and failed APIs expose stable loading and error states", async ({
  page,
}) => {
  await page.route("**/api/downloads?page=1", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ response: await route.fetch() });
  });
  await page.goto("/downloads");
  await expect(page.getByRole("status")).toContainText("Loading downloads");
  await expect(
    page.getByText("Aikido Grading Requirements", { exact: false }).first(),
  ).toBeVisible();
  await page.unroute("**/api/downloads?page=1");

  await page.route("**/api/newsletters?slug=*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Sanitized fixture outage" }),
    }),
  );
  await page.goto("/newsletter/capacity-newsletter-0001");
  await expect(
    page.getByRole("heading", { name: "Sanitized fixture outage" }),
  ).toBeVisible();
});

test("sanitized student lookup completes without URL or storage disclosure", async ({
  page,
}) => {
  const fixture = credentials();
  await page.goto("/student-records");
  await page.getByLabel("Student name").fill(fixture.studentName);
  await page
    .getByRole("textbox", { name: /^Student ID/ })
    .fill(fixture.studentId);
  const submit = page.getByRole("button", { name: "Find my record" });
  await expect(submit).toBeEnabled({ timeout: 30_000 });
  await submit.click();
  await expect(
    page.getByText(fixture.studentName, { exact: true }).first(),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/student-records$/);
  const stored = await page.evaluate(() =>
    [...Object.keys(localStorage), ...Object.keys(sessionStorage)].map(
      (key) => [key, localStorage.getItem(key) ?? sessionStorage.getItem(key)],
    ),
  );
  expect(JSON.stringify(stored)).not.toContain(fixture.studentName);
  expect(JSON.stringify(stored)).not.toContain(fixture.studentId);
});

test("a new pending profile is immediately usable and exposes no credentials in the URL", async ({
  page,
}) => {
  const pendingName = `Sanitized Pending Student ${Date.now()}`;
  await page.goto("/student-records");
  await page.getByRole("button", { name: /New profile/ }).click();
  await page.getByLabel(/^English name/).fill(pendingName);
  await page.getByLabel(/^Current dojo/).selectOption("dojo-rsk");
  await expect(page.getByText("Verification complete.")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Create student profile" }).click();

  await expect(
    page.getByRole("heading", { name: "Your student profile is ready" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".profile-created")).toBeFocused();
  await expect(page.getByText(pendingName, { exact: true })).toBeVisible();
  await expect(
    page.getByText("Pending administrator review", { exact: true }),
  ).toBeVisible();
  const generatedId = await page.getByLabel("Your new Student ID").inputValue();
  expect(generatedId).toMatch(/^[A-Z0-9]{2,8}-\d{4,}$/);
  expect(page.url()).not.toContain(encodeURIComponent(pendingName));
  expect(page.url()).not.toContain(generatedId);

  await page.getByRole("button", { name: "Open my student profile" }).click();
  await expect(
    page.getByText("Pending administrator review", { exact: true }).first(),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/student-records$/);
});

test("admin workflows bootstrap once, remain scoped, and do not retain passwords", async ({
  page,
}) => {
  let sessionRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/admin/session") {
      sessionRequests += 1;
    }
  });
  const fixture = await signInAsSyntheticAdministrator(page);
  expect(sessionRequests).toBeLessThanOrEqual(2);
  const stored = await page.evaluate(() =>
    [...Object.keys(localStorage), ...Object.keys(sessionStorage)].flatMap(
      (key) => [
        key,
        localStorage.getItem(key) ?? sessionStorage.getItem(key) ?? "",
      ],
    ),
  );
  expect(JSON.stringify(stored)).not.toContain(fixture.password);

  await Promise.all([
    page.waitForURL(/\/admin\/students$/, { timeout: 15_000 }),
    page.getByRole("link", { name: "Student database" }).first().click(),
  ]);
  await expect(
    page.getByRole("heading", { name: "Students", level: 1 }),
  ).toBeVisible({ timeout: 15_000 });
  const studentRow = page.getByRole("row", {
    name: new RegExp(fixture.studentName),
  });
  await expect(studentRow).toBeVisible();
  await studentRow.getByRole("button", { name: "Open record" }).click();
  await expect(
    page.getByRole("dialog", { name: fixture.studentName }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close student workspace" }).click();

  for (const [link, heading] of [
    ["Training hour requests", "Training hour requests"],
    ["Exam applications", "Exam applications"],
    ["Exam payment proofs", "Exam payment proofs"],
    ["Monthly contributions", "Monthly contributions"],
    ["AAT annual contributions", "AAT annual contributions"],
    ["Payment proofs", "Payment proofs"],
    ["Downloads", "Downloads"],
    ["Audit log", "Audit log"],
  ] as const) {
    await page.getByRole("link", { name: link, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true, level: 1 }),
    ).toBeVisible({ timeout: 15_000 });
    if (link === "Monthly contributions") {
      await expect(
        page.getByRole("columnheader", { name: "Renewal" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Consecutive" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "History" }),
      ).toBeVisible();
    }
  }

  await page
    .getByRole("link", { name: "Edit the website", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Edit the website" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Newsletters and updates" }),
  ).toBeVisible();
  await expect(page.locator(".admin-newsletter-count")).toHaveText(
    `${Number(process.env.RSK_E2E_NEWSLETTER_COUNT || fixture.newsletterCount || 500)} newsletters`,
    { timeout: 30_000 },
  );
  await expect(
    page.getByRole("heading", { name: "Public galleries" }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
  expect(sessionRequests).toBeLessThanOrEqual(2);
});

test("expired admin sessions fail closed and private responses are not cached", async ({
  page,
  request,
}) => {
  await signInAsSyntheticAdministrator(page);
  await page.context().clearCookies();
  await page.goto("/admin/students");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  const response = await request.get("/api/admin/students?page=1", {
    headers: { Cookie: "rsk_admin_session=expired" },
  });
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("private");
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("release visual samples are captured for manual comparison", async ({
  browser,
  baseURL,
}, testInfo) => {
  mkdirSync("tmp/release-visual", { recursive: true });
  for (const [name, viewport, path] of [
    ["home-desktop", { width: 1440, height: 900 }, "/"],
    ["records-mobile", { width: 390, height: 844 }, "/student-records"],
  ] as const) {
    // Keep each visual sample in an isolated document. Firefox can otherwise
    // carry a pending form/document navigation from the very tall home-page
    // capture into the next sample, producing a POST to the next page instead
    // of the GET requested by page.goto.
    const context = await browser.newContext({ baseURL, viewport });
    const sample = await context.newPage();
    try {
      const response = await sample.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      expect(response?.status(), path).toBeLessThan(400);
      await expect(sample.locator("main")).toBeVisible({ timeout: 15_000 });
      await expect(sample.locator("h1").first()).toBeVisible({
        timeout: 15_000,
      });
      await sample.evaluate(() => document.fonts.ready);
      const { pageHeight, deviceScaleFactor } = await sample.evaluate(() => ({
        pageHeight: Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        ),
        deviceScaleFactor: window.devicePixelRatio || 1,
      }));
      const maxFullPageHeight = Math.floor(30_000 / deviceScaleFactor);
      if (pageHeight <= maxFullPageHeight) {
        await sample.screenshot({
          path: `tmp/release-visual/${testInfo.project.name}-${name}.png`,
          fullPage: true,
          animations: "disabled",
        });
      } else {
        const segmentHeight = viewport.height;
        for (
          let y = 0, part = 1;
          y < pageHeight;
          y += segmentHeight, part += 1
        ) {
          await sample.evaluate(
            (scrollTop) => window.scrollTo(0, scrollTop),
            y,
          );
          await sample.evaluate(
            () =>
              new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => resolve()),
                ),
              ),
          );
          await sample.screenshot({
            path: `tmp/release-visual/${testInfo.project.name}-${name}-part-${part}.png`,
            animations: "disabled",
          });
        }
        await sample.evaluate(() => window.scrollTo(0, 0));
      }
    } finally {
      await context.close();
    }
  }
});
