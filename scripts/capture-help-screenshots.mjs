import { spawnSync } from "node:child_process";

function run(command, args, environment = process.env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: environment,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

run("npm", ["run", "build"]);
run(
  "npx",
  [
    "playwright",
    "test",
    "e2e/help-screenshots.spec.ts",
    "--project=chromium",
    "--workers=1",
  ],
  { ...process.env, CAPTURE_HELP_SCREENSHOTS: "1" },
);
