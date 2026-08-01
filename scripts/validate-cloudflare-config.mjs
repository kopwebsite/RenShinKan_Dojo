import { readFileSync } from "node:fs";

const config = readFileSync(
  new URL("../wrangler.toml", import.meta.url),
  "utf8",
);
const release = process.argv.includes("--release");

function environmentBlock(name) {
  const marker = `[env.${name}.vars]`;
  const start = config.indexOf(marker);
  if (start < 0) throw new Error(`Missing explicit ${name} environment`);
  const next =
    name === "preview"
      ? config.indexOf("[env.production.vars]", start + marker.length)
      : -1;
  return config.slice(start, next < 0 ? config.length : next);
}

function value(block, pattern, label) {
  const match = block.match(pattern);
  if (!match) throw new Error(`Missing ${label}`);
  return match[1];
}

function resources(name) {
  const block = environmentBlock(name);
  return {
    kv: value(
      block,
      /\[\[env\.[^.]+\.kv_namespaces\]\][\s\S]*?binding\s*=\s*"CONTENT_KV"[\s\S]*?id\s*=\s*"([^"]+)"/,
      `${name} CONTENT_KV`,
    ),
    d1: value(
      block,
      /\[\[env\.[^.]+\.d1_databases\]\][\s\S]*?binding\s*=\s*"STUDENT_DB"[\s\S]*?database_id\s*=\s*"([^"]+)"/,
      `${name} STUDENT_DB`,
    ),
    r2: value(
      block,
      /\[\[env\.[^.]+\.r2_buckets\]\][\s\S]*?binding\s*=\s*"MEDIA_BUCKET"[\s\S]*?bucket_name\s*=\s*"([^"]+)"/,
      `${name} MEDIA_BUCKET`,
    ),
    appEnv: value(block, /APP_ENV\s*=\s*"([^"]+)"/, `${name} APP_ENV`),
    siteUrl: value(block, /SITE_URL\s*=\s*"([^"]+)"/, `${name} SITE_URL`),
    turnstile: value(
      block,
      /VITE_TURNSTILE_SITE_KEY\s*=\s*"([^"]+)"/,
      `${name} Turnstile site key`,
    ),
    buildId: value(block, /BUILD_ID\s*=\s*"([^"]+)"/, `${name} build ID`),
  };
}

const preview = resources("preview");
const production = resources("production");
for (const key of ["kv", "d1", "r2"]) {
  if (preview[key] === production[key])
    throw new Error(
      `Preview and production ${key.toUpperCase()} resources must differ`,
    );
}
if (preview.appEnv !== "preview" || production.appEnv !== "production")
  throw new Error("APP_ENV values do not match their environments");
if (preview.siteUrl === production.siteUrl)
  throw new Error("Preview and production origins must differ");

if (release) {
  const unresolved = Object.entries(preview).filter(([, entry]) =>
    /PLACEHOLDER|example\.invalid|^1{8}|set-by-/i.test(entry),
  );
  if (unresolved.length)
    throw new Error(
      `Preview release configuration is unresolved: ${unresolved.map(([key]) => key).join(", ")}`,
    );
  if (/set-by-/i.test(production.buildId))
    throw new Error(
      "Production BUILD_ID must be injected from the release commit",
    );
}

console.log(
  `Cloudflare config is isolated for preview and production${release ? " and contains no release placeholders" : ""}.`,
);
