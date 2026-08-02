import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputPath = resolve(
  process.argv.find((argument) => argument.startsWith("--output="))?.slice(9) ||
    ".perf/preview-credentials.json",
);
mkdirSync(resolve(outputPath, ".."), { recursive: true });

const password = randomBytes(24).toString("base64url");
const sessionSecret = randomBytes(48).toString("base64url");
const passwordHash = `hmac-sha256:${createHmac("sha256", sessionSecret).update(password).digest("hex")}`;
const credentials = {
  adminName: "Sanitized Preview Administrator",
  password,
  studentName: "Sanitized Student One",
  studentId: "TST-260001",
  newsletterCount: 50,
  secrets: {
    ADMIN_PASSWORD_HASH: passwordHash,
    SESSION_SECRET: sessionSecret,
    STUDENT_LOOKUP_PEPPER: randomBytes(48).toString("base64url"),
    TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  },
};

writeFileSync(outputPath, `${JSON.stringify(credentials)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
process.stdout.write(
  `${JSON.stringify({ outputPath, adminName: credentials.adminName, sanitized: true })}\n`,
);
