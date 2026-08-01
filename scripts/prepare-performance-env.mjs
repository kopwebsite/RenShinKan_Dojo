import { pbkdf2Sync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputDirectory = resolve(".perf");
mkdirSync(outputDirectory, { recursive: true });

const password = "LocalCapacityOnly!2026";
const secondaryPassword = "LocalCapacitySecond!2026";
const iterations = 310_000;

function passwordHash(value, saltLabel) {
  const salt = Buffer.from(saltLabel.padEnd(18, "-").slice(0, 18), "utf8");
  const digest = pbkdf2Sync(value, salt, iterations, 32, "sha256");
  return `pbkdf2-sha256:${iterations}:${salt.toString("base64url")}:${digest.toString("base64url")}`;
}

const variables = [
  `ADMIN_PASSWORD_HASH="${passwordHash(password, "rsk-perf-primary")}"`,
  `DOJO_ADMIN_PASSWORD_HASHES='{}'`,
  `RSK_ADMIN_SECONDARY_PASSWORD_HASH="${passwordHash(secondaryPassword, "rsk-perf-secondary")}"`,
  `SESSION_SECRET="local-capacity-session-secret-2026-only"`,
  `STUDENT_LOOKUP_PEPPER="local-capacity-student-pepper-2026-only"`,
  `SITE_URL="http://127.0.0.1:8788"`,
  `ALLOWED_ORIGIN="http://127.0.0.1:8788"`,
  `APP_ENV="local"`,
  `PERFORMANCE_DIAGNOSTICS="true"`,
  `BUILD_ID="local-capacity-review"`,
  `UPLOADS_ENABLED="true"`,
  `NEWSLETTER_PUBLISHING_ENABLED="true"`,
].join("\n");

const envPath = resolve(outputDirectory, "performance.dev.vars");
writeFileSync(envPath, `${variables}\n`, { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({
  envPath,
  adminName: "Capacity Reviewer",
  password,
  secondaryPassword,
  localOnly: true,
}));
