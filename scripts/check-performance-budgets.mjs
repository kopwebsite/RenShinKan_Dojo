import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(resolve(root, "performance-budgets.json"), "utf8"));
const dist = resolve(root, process.argv.find((value) => value.startsWith("--dist="))?.slice(7) || "dist");
const browserPath = process.argv.find((value) => value.startsWith("--browser="))?.slice(10);
const apiPath = process.argv.find((value) => value.startsWith("--api="))?.slice(6);
const failures = [];
const warnings = [];

function gzipKiB(file) {
  return gzipSync(readFileSync(file)).byteLength / 1024;
}

function check(label, actual, maximum, unit = "") {
  const rendered = `${actual.toFixed(2)}${unit} / ${maximum}${unit}`;
  if (actual > maximum) failures.push(`${label}: ${rendered}`);
  else if (actual > maximum * 0.9) warnings.push(`${label}: ${rendered}`);
  console.log(`${label}: ${rendered}`);
}

if (!existsSync(dist)) throw new Error(`Build output not found: ${dist}`);
const assets = readdirSync(resolve(dist, "assets")).map((name) => ({ name, path: resolve(dist, "assets", name) }));
const find = (pattern) => assets.find((asset) => pattern.test(asset.name));
const main = find(/^index-[\w-]+\.js$/);
const vendor = find(/^react-vendor-[\w-]+\.js$/);
const dashboard = find(/^AdminDashboardPage-[\w-]+\.js$/);
const adminPage = find(/^AdminPage-[\w-]+\.js$/);
const newsletterManager = find(/^AdminNewsletterManager-[\w-]+\.js$/);
const initialCss = find(/^index-[\w-]+\.css$/);
for (const asset of [main, vendor, dashboard, adminPage, newsletterManager, initialCss]) {
  if (!asset) failures.push("A required build entry could not be identified; Vite output naming changed.");
}
if (main && vendor) check("Public initial JavaScript", gzipKiB(main.path) + gzipKiB(vendor.path), config.build.publicInitialJavascriptGzipKiB, " KiB gzip");
if (main && vendor && dashboard) check("Admin dashboard JavaScript", gzipKiB(main.path) + gzipKiB(vendor.path) + gzipKiB(dashboard.path), config.build.adminDashboardJavascriptGzipKiB, " KiB gzip");
if (main && vendor && adminPage && newsletterManager) check("Admin website initial JavaScript", gzipKiB(main.path) + gzipKiB(vendor.path) + gzipKiB(adminPage.path) + gzipKiB(newsletterManager.path), config.build.adminWebsiteInitialJavascriptGzipKiB, " KiB gzip");
const routeChunks = assets.filter((asset) => asset.name.endsWith(".js") && asset !== main && asset !== vendor);
const largest = routeChunks.map((asset) => ({ name: asset.name, size: gzipKiB(asset.path) })).sort((a, b) => b.size - a.size)[0];
if (largest) check(`Largest route chunk (${largest.name})`, largest.size, config.build.largestRouteChunkGzipKiB, " KiB gzip");
if (initialCss) check("Initial CSS", gzipKiB(initialCss.path), config.build.initialCssGzipKiB, " KiB gzip");
const optimizedImages = resolve(root, "public", "optimized");
if (existsSync(optimizedImages)) {
  const imageFiles = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/-640\.avif$/i.test(entry.name)) imageFiles.push(path);
    }
  };
  visit(optimizedImages);
  const largestImage = imageFiles.map((path) => ({ path, size: readFileSync(path).byteLength / 1024 })).sort((a, b) => b.size - a.size)[0];
  if (largestImage) check(`Largest 640px AVIF (${basename(largestImage.path)})`, largestImage.size, config.build.responsiveImage640KiB, " KiB");
}

if (browserPath) {
  const report = JSON.parse(readFileSync(resolve(root, browserPath), "utf8"));
  for (const [route, limits] of Object.entries(config.browser)) {
    const result = report.results?.[route];
    if (!result) { failures.push(`Browser report is missing ${route}.`); continue; }
    for (const [metric, maximum] of Object.entries(limits)) {
      if (result[metric] == null) failures.push(`Browser report is missing ${route} ${metric}.`);
      else check(`${route} ${metric}`, Number(result[metric]), Number(maximum));
    }
  }
}

if (apiPath) {
  const report = JSON.parse(readFileSync(resolve(root, apiPath), "utf8"));
  for (const [route, maximum] of Object.entries(config.apiP95Ms)) {
    const result = report.results?.[route];
    if (!result) { failures.push(`API report is missing ${route}.`); continue; }
    check(`${route} p95`, Number(result.p95Ms), Number(maximum), " ms");
  }
}

if (warnings.length) console.warn(`Performance budget warnings:\n- ${warnings.join("\n- ")}`);
if (failures.length) {
  console.error(`Performance budget failures:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Performance budgets passed (${basename(dist)}).`);
}
