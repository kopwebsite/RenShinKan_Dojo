import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

declare const process: {
  env: Record<string, string | undefined>;
};

const WRANGLER_PUBLIC_VARS = [
  "VITE_SITE_URL",
  "VITE_TURNSTILE_SITE_KEY",
] as const;

const TURNSTILE_TEST_SITE_KEY_PATTERN = /^[123]x0{20,}/;

function buildEnvironmentHeader(useWranglerVars: boolean) {
  if (!useWranglerVars) return "[vars]";
  if (process.env.RSK_BUILD_ENV === "local") return "[vars]";
  if (process.env.RSK_BUILD_ENV === "preview") return "[env.preview.vars]";
  if (process.env.RSK_BUILD_ENV === "production")
    return "[env.production.vars]";
  return process.env.CF_PAGES_BRANCH && process.env.CF_PAGES_BRANCH !== "main"
    ? "[env.preview.vars]"
    : "[env.production.vars]";
}

function buildIdentifier(environmentHeader: string) {
  const supplied = process.env.BUILD_ID;
  if (supplied && /^[A-Za-z0-9._-]{7,64}$/.test(supplied))
    return supplied.slice(0, 16);
  try {
    const config = readFileSync("wrangler.toml", "utf8");
    const configured = getWranglerVarsBlock(config, environmentHeader).match(
      /^BUILD_ID\s*=\s*"([^"]+)"/m,
    )?.[1];
    if (configured && /^[A-Za-z0-9._-]{7,64}$/.test(configured)) {
      return configured.slice(0, 16);
    }
  } catch {
    // Fall through to the source revision for repositories without Wrangler.
  }
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "local-unknown";
  }
}

function getCloudflarePagesBuildDefines(
  useWranglerVars: boolean,
  environmentHeader: string,
) {
  if (!useWranglerVars) {
    return undefined;
  }

  let wranglerConfig = "";

  try {
    wranglerConfig = readFileSync("wrangler.toml", "utf8");
  } catch {
    throw new Error(
      "Production builds require wrangler.toml so Cloudflare public variables can be embedded safely.",
    );
  }

  const varsBlock = getWranglerVarsBlock(wranglerConfig, environmentHeader);
  if (!varsBlock) {
    throw new Error(
      "Production builds require a [vars] block in wrangler.toml.",
    );
  }

  const define: Record<string, string> = {};
  const productionBuild = environmentHeader === "[env.production.vars]";

  for (const key of WRANGLER_PUBLIC_VARS) {
    const match = varsBlock.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"));
    if (match) {
      if (
        key === "VITE_TURNSTILE_SITE_KEY" &&
        productionBuild &&
        (TURNSTILE_TEST_SITE_KEY_PATTERN.test(match[1]) ||
          match[1].startsWith("PLACEHOLDER_"))
      ) {
        throw new Error(
          "Production builds require a real Cloudflare Turnstile site key in wrangler.toml.",
        );
      }

      define[`import.meta.env.${key}`] = JSON.stringify(match[1]);
    }
  }

  if (!define["import.meta.env.VITE_TURNSTILE_SITE_KEY"]) {
    throw new Error(
      "Production builds require VITE_TURNSTILE_SITE_KEY in wrangler.toml.",
    );
  }

  return define;
}

function getWranglerVarsBlock(config: string, header = "[vars]") {
  const lines = config.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === header);

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

const SPA_ROUTES = new Set([
  "/aikido",
  "/classes",
  "/community",
  "/contact",
  "/instructors",
  "/newsletter",
  "/student-records",
  "/records",
  "/support",
  "/workshops",
  "/admin",
  "/admin/dashboard",
  "/admin/students",
  "/admin/audit",
  "/admin/dojo-updates",
  "/admin/memberships",
  "/admin/dojos",
  "/admin/site-editor",
]);

function spaRouteFallback() {
  return {
    name: "renshinkan-spa-route-fallback",
    configureServer(server: {
      middlewares: {
        use(
          handler: (
            request: {
              url?: string;
              headers: Record<string, string | string[] | undefined>;
            },
            response: unknown,
            next: () => void,
          ) => void,
        ): void;
      };
    }) {
      server.middlewares.use((request, _response, next) => {
        const pathname =
          (request.url || "").split(/[?#]/, 1)[0].replace(/\/$/, "") || "/";
        const acceptsHtml = String(request.headers.accept || "").includes(
          "text/html",
        );
        if (
          acceptsHtml &&
          (SPA_ROUTES.has(pathname) ||
            pathname.startsWith("/newsletter/") ||
            pathname.startsWith("/records/share/") ||
            pathname.startsWith("/admin/galleries/"))
        )
          request.url = "/";
        next();
      });
    },
  };
}

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

export default defineConfig(({ command }) => {
  const useWranglerVars = command === "build" || Boolean(process.env.CF_PAGES);
  const environmentHeader = buildEnvironmentHeader(useWranglerVars);
  const buildId = buildIdentifier(environmentHeader);
  const cloudflarePagesBuildDefines = getCloudflarePagesBuildDefines(
    useWranglerVars,
    environmentHeader,
  );

  return {
    base: normalizeBasePath(process.env.BASE_PATH),
    define: {
      ...(cloudflarePagesBuildDefines || {}),
      __BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [
      spaRouteFallback(),
      react(),
      {
        name: "renshinkan-build-identity",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "build.json",
            source: `${JSON.stringify({ buildId })}\n`,
          });
        },
      },
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(
                id,
              )
            ) {
              return "react-vendor";
            }

            return undefined;
          },
        },
      },
    },
  };
});
