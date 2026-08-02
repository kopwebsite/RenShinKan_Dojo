import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const baseUrl = (
  process.argv.find((argument) => argument.startsWith("--base="))?.slice(7) ||
  "http://127.0.0.1:8788"
).replace(/\/$/, "");
const label =
  process.argv.find((argument) => argument.startsWith("--label="))?.slice(8) ||
  "browser";
const output = resolve(
  process.argv.find((argument) => argument.startsWith("--output="))?.slice(9) ||
    `.perf/${label}-browser.json`,
);
const throttled = !process.argv.includes("--unthrottled");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  serviceWorkers: "block",
});

async function authenticate() {
  const headers = { Origin: baseUrl, "X-Request-ID": crypto.randomUUID() };
  const login = await context.request.post(`${baseUrl}/api/admin/login`, {
    headers,
    data: {
      adminName: "Capacity Reviewer",
      password: "LocalCapacityOnly!2026",
    },
  });
  if (!login.ok()) throw new Error(`Admin login failed (${login.status()})`);
  let cookie = login.headers()["set-cookie"]?.split(";", 1)[0] || "";
  const selected = await context.request.post(
    `${baseUrl}/api/admin/select-dojo`,
    {
      headers: {
        ...headers,
        Cookie: cookie,
        "X-Request-ID": crypto.randomUUID(),
      },
      data: { dojoId: "dojo-rsk" },
    },
  );
  if (!selected.ok())
    throw new Error(`Dojo selection failed (${selected.status()})`);
  cookie = selected.headers()["set-cookie"]?.split(";", 1)[0] || cookie;
  const separator = cookie.indexOf("=");
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: baseUrl,
      secure: false,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

await authenticate();

const allRoutes = [
  ["public-home", "/"],
  ["newsletter-index", "/newsletter"],
  ["newsletter-article", "/newsletter/capacity-newsletter-0049"],
  ["presentation-viewer", "/newsletter/capacity-newsletter-0050"],
  ["gallery", "/community"],
  ["downloads", "/downloads"],
  ["student-record-lookup", "/student-records"],
  [
    "student-passport",
    "/records/share/capacity_passport_000000000000000000000000000000000001",
  ],
  ["admin-dashboard", "/admin/dashboard"],
  ["student-database", "/admin/students"],
  ["student-workspace", "/admin/students?student=perf-student-0001"],
  ["training-requests", "/admin/training-requests"],
  ["examination-applications", "/admin/exam-applications"],
  ["payments", "/admin/payment-proofs"],
  ["newsletter-editor", "/admin/website"],
  ["gallery-manager", "/admin/galleries/on-the-mat"],
  ["audit-log", "/admin/audit"],
];
const requestedRoutes = new Set(
  (
    process.argv
      .find((argument) => argument.startsWith("--routes="))
      ?.slice(9) || ""
  )
    .split(",")
    .filter(Boolean),
);
const routes = requestedRoutes.size
  ? allRoutes.filter(([name]) => requestedRoutes.has(name))
  : allRoutes;
const expectedAdminHeadings = {
  "admin-dashboard": "Dashboard",
  "student-database": "Students",
  "student-workspace": "Students",
  "training-requests": "Training hour requests",
  "examination-applications": "Exam applications",
  payments: "Payment proofs",
  "newsletter-editor": "Edit the website",
  "gallery-manager": "On the Mat",
  "audit-log": "Audit log",
};
const expectedAdminDataPaths = {
  "admin-dashboard": "/api/admin/dashboard",
  "student-database": "/api/admin/students",
  "student-workspace": "/api/admin/students",
  "training-requests": "/api/admin/students",
  "examination-applications": "/api/admin/examinations",
  payments: "/api/admin/payment-proofs",
  "newsletter-editor": "/api/admin/site-content",
  "gallery-manager": "/api/admin/galleries",
  "audit-log": "/api/admin/audit",
};

const observerScript = () => {
  window.__capacityPerf = { shifts: [], longTasks: [], events: [], lcp: [] };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (!entry.hadRecentInput)
          window.__capacityPerf.shifts.push(entry.value);
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        window.__capacityPerf.longTasks.push(entry.duration);
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        window.__capacityPerf.events.push({
          name: entry.name,
          duration: entry.duration,
          interactionId: entry.interactionId,
        });
    }).observe({ type: "event", buffered: true, durationThreshold: 16 });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        window.__capacityPerf.lcp.push(entry.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}
};

async function measure(name, path) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (throttled) {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: 1_600_000 / 8,
      uploadThroughput: 750_000 / 8,
      connectionType: "cellular4g",
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await page.addInitScript(observerScript);
  const expectedDataPath = expectedAdminDataPaths[name];
  const dataResponse = expectedDataPath
    ? page.waitForResponse(
        (candidate) =>
          new URL(candidate.url()).pathname === expectedDataPath &&
          candidate.status() < 400,
        { timeout: 45_000 },
      )
    : null;
  const started = performance.now();
  const response = await page.goto(`${baseUrl}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => {});
  const expectedHeading = expectedAdminHeadings[name];
  const readyHeading = expectedHeading
    ? page.getByRole("heading", {
        name: expectedHeading,
        exact: true,
        level: 1,
      })
    : page.locator("main h1").first();
  await readyHeading.waitFor({ state: "visible", timeout: 30_000 });
  if (dataResponse) await dataResponse;
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => {});
  if (name === "student-workspace") {
    const openRecord = page
      .getByRole("button", { name: /open record/i })
      .first();
    if (await openRecord.isVisible().catch(() => false)) {
      const workspaceResponse = page.waitForResponse(
        (candidate) =>
          new URL(candidate.url()).pathname ===
            "/api/admin/students/perf-student-0001" && candidate.status() < 400,
        { timeout: 30_000 },
      );
      await openRecord.click();
      await workspaceResponse;
      await page
        .getByRole("dialog", { name: /student workspace/i })
        .waitFor({ state: "visible", timeout: 15_000 })
        .catch(() => {});
    }
  }
  await page.waitForTimeout(500);
  const wallMs = performance.now() - started;
  let helpInteractionMs = null;
  let testedInteractionMs = null;
  if (name === "public-home" || name === "admin-dashboard") {
    const help = page.getByRole("button", { name: /help/i }).first();
    if (await help.isVisible().catch(() => false)) {
      const interactionStarted = performance.now();
      await help.click();
      await page
        .getByRole("dialog")
        .waitFor({ state: "visible", timeout: 30_000 })
        .catch(() => {});
      helpInteractionMs = performance.now() - interactionStarted;
      await page.keyboard.press("Escape");
    }
  }
  if (name === "gallery" || name === "downloads") {
    const label =
      name === "gallery" ? /load more albums/i : /load more downloads/i;
    const loadMore = page.getByRole("button", { name: label }).first();
    if (await loadMore.isVisible().catch(() => false)) {
      const interactionStarted = performance.now();
      await loadMore.click();
      await page.waitForTimeout(750);
      testedInteractionMs = performance.now() - interactionStarted;
    }
  }
  const result = await page.evaluate(() => {
    const resources = performance.getEntriesByType("resource");
    const navigation = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(
      performance
        .getEntriesByType("paint")
        .map((entry) => [entry.name, entry.startTime]),
    );
    const byKind = (predicate) =>
      resources
        .filter(predicate)
        .reduce(
          (sum, entry) =>
            sum + (entry.transferSize || entry.encodedBodySize || 0),
          0,
        );
    const perf = window.__capacityPerf || {
      shifts: [],
      longTasks: [],
      events: [],
      lcp: [],
    };
    const eventDurations = perf.events
      .filter((entry) => entry.interactionId)
      .map((entry) => entry.duration);
    return {
      domContentLoadedMs: navigation?.domContentLoadedEventEnd || null,
      loadMs: navigation?.loadEventEnd || null,
      ttfbMs: navigation?.responseStart || null,
      fcpMs: paints["first-contentful-paint"] || null,
      lcpMs: perf.lcp.length ? perf.lcp.at(-1) : null,
      requestCount: resources.length + 1,
      transferBytes:
        (navigation?.transferSize || navigation?.encodedBodySize || 0) +
        byKind(() => true),
      javascriptBytes: byKind(
        (entry) =>
          entry.initiatorType === "script" || /\.js(?:\?|$)/.test(entry.name),
      ),
      imageBytes: byKind(
        (entry) =>
          entry.initiatorType === "img" ||
          /\.(?:avif|webp|png|jpe?g)(?:\?|$)/.test(entry.name),
      ),
      apiBytes: byKind((entry) =>
        new URL(entry.name).pathname.startsWith("/api/"),
      ),
      domNodes: document.getElementsByTagName("*").length,
      cls: perf.shifts.reduce((sum, value) => sum + value, 0),
      longTaskCount: perf.longTasks.length,
      longestTaskMs: perf.longTasks.length ? Math.max(...perf.longTasks) : 0,
      totalLongTaskMs: perf.longTasks.reduce((sum, value) => sum + value, 0),
      maxInteractionMs: eventDurations.length
        ? Math.max(...eventDurations)
        : null,
      duplicateRequestUrls: Object.entries(
        resources.reduce((counts, entry) => {
          counts[entry.name] = (counts[entry.name] || 0) + 1;
          return counts;
        }, {}),
      )
        .filter(([, count]) => count > 1)
        .map(([url, count]) => ({ url, count })),
    };
  });
  const heap = await cdp.send("Runtime.getHeapUsage").catch(() => null);
  await page.close();
  return {
    path,
    status: response?.status() || null,
    wallMs: Number(wallMs.toFixed(2)),
    helpInteractionMs:
      helpInteractionMs == null ? null : Number(helpInteractionMs.toFixed(2)),
    testedInteractionMs:
      testedInteractionMs == null
        ? null
        : Number(testedInteractionMs.toFixed(2)),
    ...result,
    usedHeapBytes: heap?.usedSize || null,
    totalHeapBytes: heap?.totalSize || null,
  };
}

const results = {};
try {
  for (const [name, path] of routes) {
    results[name] = await measure(name, path);
    console.log(JSON.stringify({ name, ...results[name] }));
  }
} finally {
  await browser.close();
}

mkdirSync(resolve(output, ".."), { recursive: true });
const report = {
  label,
  baseUrl,
  generatedAt: new Date().toISOString(),
  profile: throttled
    ? "390x844 DPR3, 4x CPU, 1.6Mbps down/750Kbps up/150ms RTT"
    : "390x844 DPR3, unthrottled",
  fixture: "sanitized-capacity-v1",
  productionTouched: false,
  results,
};
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({
    output,
    routeCount: Object.keys(results).length,
    productionTouched: false,
  }),
);
