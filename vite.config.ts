import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

declare const process: {
  env: Record<string, string | undefined>;
};

const WRANGLER_PUBLIC_VARS = [
  "VITE_SITE_URL",
  "VITE_MEMBERSHIP_WORKER_URL",
  "VITE_TURNSTILE_SITE_KEY",
] as const;

function getCloudflarePagesBuildDefines() {
  if (!process.env.CF_PAGES) {
    return undefined;
  }

  let wranglerConfig = "";

  try {
    wranglerConfig = readFileSync("wrangler.toml", "utf8");
  } catch {
    return undefined;
  }

  const varsBlock = getWranglerVarsBlock(wranglerConfig);
  if (!varsBlock) {
    return undefined;
  }

  const define: Record<string, string> = {};

  for (const key of WRANGLER_PUBLIC_VARS) {
    const match = varsBlock.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"));
    if (match) {
      define[`import.meta.env.${key}`] = JSON.stringify(match[1]);
    }
  }

  return define;
}

function getWranglerVarsBlock(config: string) {
  const lines = config.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "[vars]");

  if (start === -1) {
    return "";
  }

  const block: string[] = [];

  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[/.test(line)) {
      break;
    }

    block.push(line);
  }

  return block.join("\n");
}

const cloudflarePagesBuildDefines = getCloudflarePagesBuildDefines();

function normalizeBasePath(basePath?: string) {
  if (!basePath) {
    return "/";
  }

  if (basePath === "." || basePath === "./") {
    return "./";
  }

  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;

  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

export default defineConfig({
  base: normalizeBasePath(process.env.BASE_PATH),
  define: cloudflarePagesBuildDefines,
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) {
            return "motion";
          }

          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return "react-vendor";
          }

          return undefined;
        },
      },
    },
  },
});
