import { pbkdf2Sync, randomBytes } from "node:crypto";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const password = Buffer.concat(chunks).toString("utf8").replace(/[\r\n]+$/, "");
if (password.length < 12 || password.length > 256) {
  process.stderr.write("Provide a 12–256 character password on standard input.\n");
  process.exitCode = 1;
} else {
  const iterations = 310_000;
  const salt = randomBytes(18);
  const digest = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  process.stdout.write(`pbkdf2-sha256:${iterations}:${salt.toString("base64url")}:${digest.toString("base64url")}\n`);
}
