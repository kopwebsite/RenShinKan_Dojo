import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pbkdf2Sync, randomBytes } from "node:crypto";

// Keep mutable Miniflare state under Wrangler's ignored working directory so
// D1/KV/R2 writes cannot trigger Pages source-watch reloads mid-request.
const state = ".wrangler/pages-smoke-state";
const smokeProjectDirectory = join(tmpdir(), "renshinkan-dojo-pages-smoke");
const fixtureDirectory = "tmp/pages-smoke-fixtures";
const credentialPath = "tmp/pages-smoke-credentials.json";
const smokeWranglerConfig = `${smokeProjectDirectory}/wrangler.jsonc`;
rmSync(state, { recursive: true, force: true });
rmSync(smokeProjectDirectory, { recursive: true, force: true });
rmSync(fixtureDirectory, { recursive: true, force: true });
mkdirSync(state, { recursive: true });
mkdirSync(smokeProjectDirectory, { recursive: true });
mkdirSync("tmp", { recursive: true });
cpSync("functions", `${smokeProjectDirectory}/functions`, { recursive: true });
cpSync("shared", `${smokeProjectDirectory}/shared`, { recursive: true });
cpSync("src", `${smokeProjectDirectory}/src`, { recursive: true });
cpSync("dist", `${smokeProjectDirectory}/dist`, { recursive: true });
symlinkSync(
  resolve("node_modules"),
  `${smokeProjectDirectory}/node_modules`,
  "junction",
);
const tomlPath = (path) => resolve(path).replaceAll("\\", "/");
writeFileSync(
  smokeWranglerConfig,
  `${JSON.stringify(
    {
      name: "renshinkan-dojo-pages-smoke",
      pages_build_output_dir: "./dist",
      compatibility_date: "2026-07-15",
      vars: {
        APP_ENV: "local",
        BUILD_ID: "local-development",
        SITE_URL: "https://127.0.0.1:8788",
        ALLOWED_ORIGIN: "https://127.0.0.1:8788",
        VITE_SITE_URL: "https://127.0.0.1:8788",
        VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
        RENSHINKAN_MONTHLY_CONTRIBUTION_AMOUNT: "1800",
        AAT_ANNUAL_CONTRIBUTION_AMOUNT: "1200",
        UPLOADS_ENABLED: "true",
        NEWSLETTER_PUBLISHING_ENABLED: "true",
        ADMIN_AUGGIE_DAILY_TOKEN_BUDGET: "100000",
      },
      kv_namespaces: [
        { binding: "CONTENT_KV", id: "00000000000000000000000000000000" },
      ],
      r2_buckets: [
        {
          binding: "MEDIA_BUCKET",
          bucket_name: "renshinkan-dojo-media-local",
        },
      ],
      d1_databases: [
        {
          binding: "STUDENT_DB",
          database_name: "renshinkan-student-records-local",
          database_id: "00000000-0000-4000-8000-000000000000",
          migrations_dir: tomlPath("migrations"),
        },
      ],
    },
    null,
    2,
  )}\n`,
  "utf8",
);
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
const smokeFixture = readFileSync(
  "tests/fixtures/previous-production-v0023.sql",
  "utf8",
);
writeFileSync(
  localSchemaPath,
  `${localSchema}\n\n-- Sanitized smoke fixture\n${smokeFixture}\n`,
  "utf8",
);
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

const wranglerPath = resolve("node_modules/wrangler/bin/wrangler.js");
function runWranglerSetup(args) {
  const result = spawnSync(process.execPath, [wranglerPath, ...args], {
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

runWranglerSetup([
  "d1",
  "execute",
  "STUDENT_DB",
  "--local",
  `--persist-to=${state}`,
  `--file=${localSchemaPath}`,
  "--yes",
]);
runWranglerSetup([
  "kv",
  "key",
  "put",
  "site:editable-content",
  `--path=${smokeContentPath}`,
  "--binding=CONTENT_KV",
  "--local",
  `--persist-to=${state}`,
]);
runWranglerSetup([
  "r2",
  "object",
  "put",
  "renshinkan-dojo-media-local/student-profiles/2026/07/00000000-0000-4000-8000-000000000001.webp",
  "--file=public/optimized/brand/renshinkan-logo.webp",
  "--content-type=image/webp",
  "--local",
  `--persist-to=${state}`,
  "--force",
]);

const server = spawn(
  process.execPath,
  [
    wranglerPath,
    "pages",
    "dev",
    "dist",
    "--ip=127.0.0.1",
    "--port=8788",
    "--local-protocol=https",
    `--persist-to=${tomlPath(state)}`,
    "--binding",
    "APP_ENV=local",
    "--binding",
    "BUILD_ID=local-development",
    "--binding",
    "VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA",
    "--binding",
    "RENSHINKAN_MONTHLY_CONTRIBUTION_AMOUNT=1800",
    "--binding",
    "AAT_ANNUAL_CONTRIBUTION_AMOUNT=1200",
    "--binding",
    "UPLOADS_ENABLED=true",
    "--binding",
    "NEWSLETTER_PUBLISHING_ENABLED=true",
    "--binding",
    "ADMIN_AUGGIE_DAILY_TOKEN_BUDGET=100000",
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
  { cwd: smokeProjectDirectory, stdio: "inherit", shell: false },
);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code || 0));
