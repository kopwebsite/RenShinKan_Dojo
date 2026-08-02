import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const baseUrl = (process.argv.find((value) => value.startsWith("--base="))?.slice(7) || "http://127.0.0.1:8788").replace(/\/$/, "");
const output = resolve(process.argv.find((value) => value.startsWith("--output="))?.slice(9) || ".perf/capacity.json");
const target = new URL(baseUrl);
const local = ["127.0.0.1", "localhost", "::1"].includes(target.hostname);
const explicitlyAllowedPreview = process.argv.includes("--allow-preview") && target.hostname.endsWith(".pages.dev");
if (!local && !explicitlyAllowedPreview) throw new Error("Capacity tests are restricted to localhost. A Cloudflare Pages preview requires --allow-preview; production hosts are refused.");
if (/renshinkandojo\.org$/i.test(target.hostname)) throw new Error("Production load testing is prohibited.");

function percentile(values, quantile) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))] || 0;
}

function cookieFrom(response, fallback = "") {
  return response.headers.get("set-cookie")?.split(";", 1)[0] || fallback;
}

async function adminCookie() {
  const headers = { "Content-Type": "application/json", Origin: baseUrl, "X-Request-ID": crypto.randomUUID() };
  const login = await fetch(`${baseUrl}/api/admin/login`, { method: "POST", headers, body: JSON.stringify({ adminName: "Capacity Reviewer", password: "LocalCapacityOnly!2026" }) });
  if (!login.ok) throw new Error(`Capacity login failed (${login.status}).`);
  let cookie = cookieFrom(login);
  const select = await fetch(`${baseUrl}/api/admin/select-dojo`, { method: "POST", headers: { ...headers, Cookie: cookie, "X-Request-ID": crypto.randomUUID() }, body: JSON.stringify({ dojoId: "dojo-rsk" }) });
  if (!select.ok) throw new Error(`Capacity dojo selection failed (${select.status}).`);
  return cookieFrom(select, cookie);
}

async function runLoad({ name, requests, concurrency, execute }) {
  const durations = [];
  const statuses = {};
  let cursor = 0;
  const memoryBefore = process.memoryUsage().rss;
  const started = performance.now();
  async function worker() {
    while (cursor < requests) {
      const current = cursor++;
      const requestStarted = performance.now();
      const response = await execute(current);
      durations.push(performance.now() - requestStarted);
      statuses[response.status] = (statuses[response.status] || 0) + 1;
      await response.arrayBuffer();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsedMs = performance.now() - started;
  return {
    requests, concurrency, statusCounts: statuses,
    p50Ms: Number(percentile(durations, 0.5).toFixed(2)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(2)),
    maxMs: Number(Math.max(...durations).toFixed(2)),
    throughputPerSecond: Number((requests / (elapsedMs / 1000)).toFixed(2)),
    clientRssDeltaBytes: process.memoryUsage().rss - memoryBefore,
  };
}

const cookie = await adminCookie();
const jsonHeaders = { "Content-Type": "application/json", Origin: baseUrl };
const cases = [
  { name: "public-reads", requests: 120, concurrency: 20, execute: (index) => fetch(`${baseUrl}${["/api/content", "/api/newsletters?page=1", "/api/downloads?page=1", "/api/galleries?galleryId=history&page=1"][index % 4]}`) },
  { name: "student-lookup-and-rate-limit", requests: 30, concurrency: 5, execute: () => fetch(`${baseUrl}/api/records/lookup`, { method: "POST", headers: { ...jsonHeaders, "CF-Connecting-IP": "198.51.100.44", "X-Request-ID": crypto.randomUUID() }, body: JSON.stringify({ name: "Synthetic Nobody", studentId: "T26-99999", turnstileToken: "local-invalid" }) }) },
  { name: "admin-lists", requests: 80, concurrency: 10, execute: (index) => fetch(`${baseUrl}${["/api/admin/students?page=1", "/api/admin/examinations?page=1", "/api/admin/memberships?page=1", "/api/admin/audit?page=1"][index % 4]}`, { headers: { Cookie: cookie } }) },
  { name: "newsletter-publish-safeguard", requests: 12, concurrency: 4, execute: () => fetch(`${baseUrl}/api/admin/newsletters/save`, { method: "POST", headers: { Origin: baseUrl, Cookie: cookie, "X-Request-ID": crypto.randomUUID() }, body: new FormData() }) },
  { name: "upload-initiation-validation", requests: 12, concurrency: 4, execute: () => fetch(`${baseUrl}/api/admin/downloads`, { method: "POST", headers: { Origin: baseUrl, Cookie: cookie, "X-Request-ID": crypto.randomUUID() }, body: new FormData() }) },
];

const results = {};
for (const testCase of cases) {
  results[testCase.name] = await runLoad(testCase);
  console.log(JSON.stringify({ name: testCase.name, ...results[testCase.name] }));
}

mkdirSync(resolve(output, ".."), { recursive: true });
const report = { generatedAt: new Date().toISOString(), baseUrl, fixture: "sanitized-capacity-v1", isolatedTestData: true, destructiveConcurrentMutations: false, productionTouched: false, results };
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output, productionTouched: false }));
