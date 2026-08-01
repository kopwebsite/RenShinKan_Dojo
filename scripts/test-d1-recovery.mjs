import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "renshinkan-d1-recovery-"));
const source = join(scratch, "source");
const target = join(scratch, "target");
const configName = "wrangler.recovery-test.jsonc";
const wranglerCli = join(
  repository,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
let stage = "prepare";

function run(cwd, args) {
  return execFileSync(process.execPath, [wranglerCli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CI: "true", NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function prepareRoot(root) {
  mkdirSync(root, { recursive: true });
  cpSync(join(repository, configName), join(root, configName));
  cpSync(join(repository, "migrations"), join(root, "migrations"), {
    recursive: true,
  });
}

function safeCleanup(path) {
  const resolved = realpathSync(path);
  const temporaryRoot = realpathSync(tmpdir());
  if (
    !resolved.startsWith(`${temporaryRoot}${sep}`) ||
    !basename(resolved).startsWith("renshinkan-d1-recovery-")
  ) {
    throw new Error("Refused to clean an unexpected recovery-test directory");
  }
  rmSync(resolved, { recursive: true, force: true });
}

try {
  prepareRoot(source);
  prepareRoot(target);

  stage = "migrate_source";
  run(source, [
    "d1",
    "migrations",
    "apply",
    "RECOVERY_DB",
    "--local",
    "--config",
    configName,
  ]);

  stage = "seed_source";
  run(source, [
    "d1",
    "execute",
    "RECOVERY_DB",
    "--local",
    "--config",
    configName,
    "--command",
    "INSERT INTO schema_deprecations (object_name, deprecated_at, replacement, note) VALUES ('recovery_fixture', '2026-08-01T00:00:00.000Z', 'none', 'non-personal restore verification');",
  ]);

  stage = "export_source";
  const exportPath = join(source, "recovery-export.sql");
  run(source, [
    "d1",
    "export",
    "RECOVERY_DB",
    "--local",
    "--config",
    configName,
    "--output",
    exportPath,
  ]);
  const exported = readFileSync(exportPath);
  const exportText = exported.toString("utf8");
  if (
    /SESSION_SECRET|ADMIN_PASSWORD_HASH|BREVO_API_KEY|TURNSTILE_SECRET_KEY/i.test(
      exportText,
    )
  ) {
    throw new Error(
      "The isolated export unexpectedly contains a secret field name",
    );
  }
  const sha256 = createHash("sha256").update(exported).digest("hex");

  stage = "restore_target";
  run(target, [
    "d1",
    "execute",
    "RECOVERY_DB",
    "--local",
    "--config",
    configName,
    "--file",
    exportPath,
  ]);

  stage = "verify_target";
  const verification = run(target, [
    "d1",
    "execute",
    "RECOVERY_DB",
    "--local",
    "--config",
    configName,
    "--json",
    "--command",
    "PRAGMA foreign_key_check; SELECT (SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name IN ('students', 'payment_proofs', 'publish_operations')) AS required_schema_count, (SELECT COUNT(*) FROM schema_deprecations WHERE object_name = 'recovery_fixture') AS fixture_count;",
  ]);
  const parsed = JSON.parse(verification);
  const foreignKeyViolations = parsed?.[0]?.results || [];
  const result = parsed?.[1]?.results?.[0];
  if (
    foreignKeyViolations.length !== 0 ||
    Number(result?.required_schema_count) !== 3 ||
    Number(result?.fixture_count) !== 1
  ) {
    throw new Error(
      "The isolated restore did not pass integrity and fixture checks",
    );
  }

  console.log(
    JSON.stringify({
      ok: true,
      source: "isolated_local_d1",
      target: "separate_isolated_local_d1",
      requiredSchemaCount: Number(result.required_schema_count),
      integrity: "foreign_keys_ok",
      fixtureCount: Number(result.fixture_count),
      exportSha256: sha256,
      productionTouched: false,
    }),
  );
} catch {
  console.error(
    JSON.stringify({
      ok: false,
      stage,
      productionTouched: false,
      error:
        "Isolated D1 recovery verification failed; command output was suppressed to protect data.",
    }),
  );
  process.exitCode = 1;
} finally {
  safeCleanup(scratch);
}
