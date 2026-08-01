import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const state = mkdtempSync(join(tmpdir(), "renshinkan-d1-replay-"));

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

run(process.execPath, [
  resolve("node_modules/wrangler/bin/wrangler.js"),
  "d1",
  "migrations",
  "apply",
  "STUDENT_DB",
  "--local",
  `--persist-to=${state}`,
]);
run("python", ["scripts/check-d1-integrity.py", "--local-state", state]);
run("python", [
  "scripts/check-d1-integrity.py",
  "--upgrade",
  "--migrations",
  "migrations",
]);
