import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const baseUrl = (process.argv.find((argument) => argument.startsWith("--base="))?.slice(7) || "http://127.0.0.1:8788").replace(/\/$/, "");
const label = process.argv.find((argument) => argument.startsWith("--label="))?.slice(8) || "benchmark";
const iterations = Math.max(3, Math.min(30, Number(process.argv.find((argument) => argument.startsWith("--iterations="))?.slice(13) || 7)));
const output = resolve(process.argv.find((argument) => argument.startsWith("--output="))?.slice(9) || `.perf/${label}-api.json`);
const adminName = "Capacity Reviewer";
const password = "LocalCapacityOnly!2026";
const secondaryPassword = "LocalCapacitySecond!2026";

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))];
}

function cookieFrom(response, fallback = "") {
  return response.headers.get("set-cookie")?.split(";", 1)[0] || fallback;
}

async function adminSession() {
  const mutationHeaders = { "Content-Type": "application/json", Origin: baseUrl, "X-Request-ID": crypto.randomUUID() };
  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: mutationHeaders,
    body: JSON.stringify({ adminName, password }),
  });
  if (!login.ok) throw new Error(`Performance login failed: ${login.status} ${await login.text()}`);
  let cookie = cookieFrom(login);
  const selected = await fetch(`${baseUrl}/api/admin/select-dojo`, {
    method: "POST",
    headers: { ...mutationHeaders, Cookie: cookie, "X-Request-ID": crypto.randomUUID() },
    body: JSON.stringify({ dojoId: "dojo-rsk" }),
  });
  if (!selected.ok) throw new Error(`Dojo selection failed: ${selected.status} ${await selected.text()}`);
  cookie = cookieFrom(selected, cookie);
  const verified = await fetch(`${baseUrl}/api/admin/verify-renshinkan`, {
    method: "POST",
    headers: { ...mutationHeaders, Cookie: cookie, "X-Request-ID": crypto.randomUUID() },
    body: JSON.stringify({ password: secondaryPassword }),
  });
  if (!verified.ok) throw new Error(`Secondary verification failed: ${verified.status} ${await verified.text()}`);
  return cookieFrom(verified, cookie);
}

async function sample(path, cookie) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: path.startsWith("/api/") ? "application/json" : "text/html", ...(cookie ? { Cookie: cookie } : {}) },
  });
  const body = await response.arrayBuffer();
  return {
    durationMs: performance.now() - started,
    status: response.status,
    bytes: body.byteLength,
    cacheControl: response.headers.get("cache-control"),
    queryCount: Number(response.headers.get("x-perf-query-count") || 0) || null,
    d1Ms: Number(response.headers.get("x-perf-d1-ms") || 0) || null,
  };
}

const cookie = await adminSession();
const routes = [
  ["public-home-html", "/"],
  ["public-newsletter-html", "/newsletter"],
  ["public-article-html", "/newsletter/capacity-newsletter-0050"],
  ["public-presentation-html", "/newsletter/capacity-newsletter-0050"],
  ["public-gallery-html", "/community"],
  ["public-downloads-html", "/downloads"],
  ["student-lookup-html", "/student-records"],
  ["admin-dashboard-html", "/admin/dashboard"],
  ["public-content-api", "/api/content"],
  ["public-newsletter-index-api", "/api/newsletters?page=1"],
  ["public-newsletter-article-api", "/api/newsletters?slug=capacity-newsletter-0049"],
  ["public-gallery-api", "/api/galleries?galleryId=history&page=1"],
  ["public-downloads-api", "/api/downloads"],
  ["admin-session-api", "/api/admin/session", true],
  ["admin-dashboard-api", "/api/admin/dashboard", true],
  ["admin-students-api", "/api/admin/students?page=1", true],
  ["admin-student-workspace-api", "/api/admin/students/perf-student-0001", true],
  ["admin-training-requests-api", "/api/admin/students?page=1&hoursStatus=pending", true],
  ["admin-examinations-api", "/api/admin/examinations?page=1", true],
  ["admin-monthly-payments-api", "/api/admin/contributions?month=2026-07&page=1", true],
  ["admin-aat-payments-api", "/api/admin/memberships?page=1", true],
  ["admin-payment-proofs-api", "/api/admin/payment-proofs?page=1", true],
  ["admin-newsletter-status-api", "/api/admin/newsletters/status", true],
  ["admin-gallery-manager-api", "/api/admin/galleries?galleryId=on-the-mat", true],
  ["admin-download-manager-api", "/api/admin/downloads", true],
  ["admin-audit-api", "/api/admin/audit?page=1", true],
];

const results = {};
for (const [name, path, authenticated] of routes) {
  await sample(path, authenticated ? cookie : "");
  const samples = [];
  for (let index = 0; index < iterations; index += 1) samples.push(await sample(path, authenticated ? cookie : ""));
  const durations = samples.map((entry) => entry.durationMs);
  results[name] = {
    path,
    iterations,
    status: samples.at(-1).status,
    bytes: samples.at(-1).bytes,
    medianMs: Number(percentile(durations, 0.5).toFixed(2)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(2)),
    maxMs: Number(Math.max(...durations).toFixed(2)),
    cacheControl: samples.at(-1).cacheControl,
    queryCount: samples.at(-1).queryCount,
    d1Ms: samples.at(-1).d1Ms,
  };
}

mkdirSync(resolve(output, ".."), { recursive: true });
const report = {
  label,
  baseUrl,
  iterations,
  generatedAt: new Date().toISOString(),
  productionTouched: false,
  fixture: "sanitized-capacity-v1",
  results,
};
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report));
