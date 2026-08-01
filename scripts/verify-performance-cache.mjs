import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const baseUrl = (process.argv.find((argument) => argument.startsWith("--base="))?.slice(7) || "http://127.0.0.1:8788").replace(/\/$/, "");
const output = resolve(process.argv.find((argument) => argument.startsWith("--output="))?.slice(9) || ".perf/cache-verification.json");

if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(baseUrl)) {
  throw new Error(`Cache verification is local-only; refused ${baseUrl}`);
}

const indexHtml = readFileSync(resolve("dist/index.html"), "utf8");
const assetPath = indexHtml.match(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/)?.[1];
if (!assetPath) throw new Error("Unable to find a hashed application asset in dist/index.html");

const checks = [
  { name: "public-html", path: "/", status: 200, includes: ["max-age=0", "must-revalidate"] },
  { name: "private-record-html", path: "/student-records", status: 200, includes: ["private", "no-store"] },
  { name: "deployment-build", path: "/build.json", status: 200, includes: ["no-cache", "must-revalidate"] },
  { name: "hashed-static-asset", path: assetPath, status: 200, includes: ["max-age=31536000", "immutable"] },
  { name: "safe-public-api", path: "/api/content", status: 200, includes: ["public", "max-age=60"] },
  { name: "private-admin-api", path: "/api/admin/session", status: 200, includes: ["private", "no-store"] },
];

const results = [];
for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, { cache: "no-store", headers: { Accept: "application/json, text/html;q=0.9, */*;q=0.8" } });
  const cacheControl = response.headers.get("cache-control") || "";
  const failures = [];
  if (response.status !== check.status) failures.push(`expected status ${check.status}, received ${response.status}`);
  for (const directive of check.includes) {
    if (!cacheControl.toLowerCase().includes(directive.toLowerCase())) failures.push(`missing ${directive}`);
  }
  results.push({ ...check, actualStatus: response.status, cacheControl, passed: failures.length === 0, failures });
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  productionTouched: false,
  passed: results.every((result) => result.passed),
  results,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
