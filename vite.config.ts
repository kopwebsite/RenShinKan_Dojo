import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

declare const process: {
  env: Record<string, string | undefined>;
};

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
  plugins: [react()],
});
