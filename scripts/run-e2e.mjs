import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function envWithHeapLimit(limit) {
  const nodeOptions = (process.env.NODE_OPTIONS || "")
    .replace(/--max-old-space-size(?:=|\s+)\d+/g, "")
    .replace(/--max-semi-space-size(?:=|\s+)\d+/g, "")
    .trim();
  return {
    ...process.env,
    NODE_OPTIONS: `${nodeOptions} --max-old-space-size=${limit}`.trim(),
  };
}

function run(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

run([resolve("scripts/optimize-images.mjs")]);
run([resolve("node_modules/vite/bin/vite.js"), "build"], {
  env: {
    ...envWithHeapLimit(process.env.RSK_BUILD_NODE_HEAP_MB || "768"),
    RSK_BUILD_ENV: "local",
  },
});
run(
  [
    resolve("node_modules/@playwright/test/cli.js"),
    "test",
    ...process.argv.slice(2),
  ],
  {
    env: envWithHeapLimit(process.env.RSK_E2E_NODE_HEAP_MB || "256"),
  },
);
