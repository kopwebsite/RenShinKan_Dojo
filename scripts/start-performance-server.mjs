import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const directory = process.argv.find((argument) => argument.startsWith("--directory="))?.slice(12) || "dist";
const state = process.argv.find((argument) => argument.startsWith("--state="))?.slice(8) || ".perf/performance-state";
const port = process.argv.find((argument) => argument.startsWith("--port="))?.slice(7) || "8788";
const envPath = resolve(".perf/performance.dev.vars");
const entries = Object.fromEntries(readFileSync(envPath, "utf8").split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (!match) return [];
  const raw = match[2].trim();
  const value = ((raw.startsWith("\"") && raw.endsWith("\"")) || (raw.startsWith("'") && raw.endsWith("'")))
    ? raw.slice(1, -1)
    : raw;
  return [[match[1], value]];
}));
entries.SITE_URL = `http://127.0.0.1:${port}`;
entries.ALLOWED_ORIGIN = entries.SITE_URL;
if (process.argv.includes("--no-diagnostics")) entries.PERFORMANCE_DIAGNOSTICS = "false";

const bindingNames = [
  "ADMIN_PASSWORD_HASH",
  "DOJO_ADMIN_PASSWORD_HASHES",
  "SESSION_SECRET",
  "STUDENT_LOOKUP_PEPPER",
  "SITE_URL",
  "ALLOWED_ORIGIN",
  "APP_ENV",
  "PERFORMANCE_DIAGNOSTICS",
  "BUILD_ID",
  "UPLOADS_ENABLED",
  "NEWSLETTER_PUBLISHING_ENABLED",
];
const args = [
  resolve("node_modules/wrangler/bin/wrangler.js"), "pages", "dev", directory,
  `--port=${port}`, `--persist-to=${state}`, "--log-level=warn",
  ...bindingNames.flatMap((name) => ["--binding", `${name}=${entries[name]}`]),
];
const server = spawn(process.execPath, args, { stdio: "inherit", shell: false });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code || 0));
