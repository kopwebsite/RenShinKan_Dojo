import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pbkdf2Sync, randomBytes } from "node:crypto";

// Keep mutable Miniflare state under Wrangler's ignored working directory so
// D1/KV/R2 writes cannot trigger Pages source-watch reloads mid-request.
const state = ".wrangler/pages-smoke-state";
const fixtureDirectory = "tmp/pages-smoke-fixtures";
const credentialPath = "tmp/pages-smoke-credentials.json";
rmSync(state, { recursive: true, force: true });
rmSync(fixtureDirectory, { recursive: true, force: true });
mkdirSync(state, { recursive: true });
mkdirSync("tmp", { recursive: true });
const password = randomBytes(24).toString("base64url");
const sessionSecret = randomBytes(48).toString("base64url");
const studentPepper = randomBytes(48).toString("base64url");
const passwordSalt = randomBytes(18);
const passwordHash = `pbkdf2-sha256:310000:${passwordSalt.toString("base64url")}:${pbkdf2Sync(password, passwordSalt, 310_000, 32, "sha256").toString("base64url")}`;
writeFileSync(
  credentialPath,
  `${JSON.stringify({
    adminName: "Sanitized Release Administrator",
    password,
    sessionSecret,
    studentName: "Sanitized Student One",
    studentId: "TST-260001",
    newsletterCount: 50,
  })}\n`,
  { encoding: "utf8", mode: 0o600 },
);
const localSchemaPath = `${state}/local-schema.sql`;
const localSchema = readdirSync("migrations")
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort()
  .map((name) => `-- ${name}\n${readFileSync(`migrations/${name}`, "utf8")}`)
  .join("\n\n");
writeFileSync(localSchemaPath, `${localSchema}\n`, "utf8");
const migrate = spawnSync(
  process.execPath,
  [
    resolve("node_modules/wrangler/bin/wrangler.js"),
    "d1",
    "execute",
    "STUDENT_DB",
    "--local",
    `--persist-to=${state}`,
    `--file=${localSchemaPath}`,
    "--yes",
  ],
  { stdio: "inherit", shell: false },
);
if (migrate.status !== 0) process.exit(migrate.status || 1);

const seed = spawnSync(
  process.execPath,
  [
    resolve("node_modules/wrangler/bin/wrangler.js"),
    "d1",
    "execute",
    "STUDENT_DB",
    "--local",
    `--persist-to=${state}`,
    "--file=tests/fixtures/previous-production-v0023.sql",
    "--yes",
  ],
  { stdio: "inherit", shell: false },
);
if (seed.status !== 0) process.exit(seed.status || 1);

const fixtures = spawnSync(
  process.execPath,
  [
    resolve("scripts/generate-performance-fixtures.mjs"),
    `--output=${fixtureDirectory}`,
  ],
  { stdio: "inherit", shell: false },
);
if (fixtures.status !== 0) process.exit(fixtures.status || 1);

const smokeContentPath = `${fixtureDirectory}/smoke-content.json`;
const prepareSmokeContent = spawnSync(
  process.execPath,
  [
    resolve("scripts/prepare-preview-content.mjs"),
    `--input=${fixtureDirectory}/performance-content.json`,
    `--output=${smokeContentPath}`,
  ],
  { stdio: "inherit", shell: false },
);
if (prepareSmokeContent.status !== 0)
  process.exit(prepareSmokeContent.status || 1);

const seedContent = spawnSync(
  process.execPath,
  [
    resolve("node_modules/wrangler/bin/wrangler.js"),
    "kv",
    "key",
    "put",
    "site:editable-content",
    `--path=${smokeContentPath}`,
    "--binding=CONTENT_KV",
    "--local",
    `--persist-to=${state}`,
  ],
  { stdio: "inherit", shell: false },
);
if (seedContent.status !== 0) process.exit(seedContent.status || 1);

const seedProfileImage = spawnSync(
  process.execPath,
  [
    resolve("node_modules/wrangler/bin/wrangler.js"),
    "r2",
    "object",
    "put",
    "renshinkan-dojo-media-local/student-profiles/2026/07/00000000-0000-4000-8000-000000000001.webp",
    "--file=public/optimized/brand/renshinkan-logo.webp",
    "--content-type=image/webp",
    "--local",
    `--persist-to=${state}`,
    "--force",
  ],
  { stdio: "inherit", shell: false },
);
if (seedProfileImage.status !== 0) process.exit(seedProfileImage.status || 1);

const server = spawn(
  process.execPath,
  [
    resolve("node_modules/wrangler/bin/wrangler.js"),
    "pages",
    "dev",
    "dist",
    "--ip=127.0.0.1",
    "--port=8788",
    "--local-protocol=https",
    `--persist-to=${state}`,
    "--binding",
    `SESSION_SECRET=${sessionSecret}`,
    "--binding",
    "SITE_URL=https://127.0.0.1:8788",
    "--binding",
    "ALLOWED_ORIGIN=https://127.0.0.1:8788",
    "--binding",
    "VITE_SITE_URL=https://127.0.0.1:8788",
    "--binding",
    `STUDENT_LOOKUP_PEPPER=${studentPepper}`,
    "--binding",
    `ADMIN_PASSWORD_HASH=${passwordHash}`,
    "--binding",
    "TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA",
    "--binding",
    "PERFORMANCE_DIAGNOSTICS=true",
  ],
  { stdio: "inherit", shell: false },
);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code || 0));
