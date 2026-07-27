import { publicNewsletter } from "../shared/newsletter";
import { readEditableContentFromStorage, type StorageEnv } from "./_lib/storage";

const SITE_URL = "https://renshinkandojo.org";
const STATIC_ROUTES = [
  ["", "weekly", "1.0"],
  ["/aikido", "monthly", "0.9"],
  ["/instructors", "monthly", "0.8"],
  ["/classes", "weekly", "0.9"],
  ["/workshops", "weekly", "0.7"],
  ["/newsletter", "weekly", "0.7"],
  ["/community", "monthly", "0.8"],
  ["/support", "monthly", "0.5"],
  ["/contact", "monthly", "0.8"],
] as const;

function xml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const onRequestGet: PagesFunction<StorageEnv> = async ({ env }) => {
  let newsletterEntries = "";
  try {
    const content = await readEditableContentFromStorage(env);
    newsletterEntries = content.recentEvents
      .filter((event) => publicNewsletter(event))
      .map((event) => `  <url>
    <loc>${xml(`${SITE_URL}/newsletter/${event.slug}`)}</loc>
    <lastmod>${xml((event.updatedAt || event.date).slice(0, 10))}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`)
      .join("\n");
  } catch {
    // Keep the static sitemap available if the content store is temporarily unavailable.
  }

  const staticEntries = STATIC_ROUTES.map(([route, frequency, priority]) => `  <url>
    <loc>${xml(`${SITE_URL}${route || "/"}`)}</loc>
    <changefreq>${frequency}</changefreq>
    <priority>${priority}</priority>
  </url>`).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticEntries}
${newsletterEntries}
</urlset>
`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
};
