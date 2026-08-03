import { jsonResponse } from "../_lib/auth";
import { readEditableContentFromStorage, type StorageEnv } from "../_lib/storage";
import type { RecentEvent } from "../_lib/content";

function publicEvents(events: RecentEvent[]) {
  return [...events]
    .filter((event) => event.published && event.lifecycleStatus !== "archived" && event.lifecycleStatus !== "trash" && !event.trashedAt)
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

function summary(event: RecentEvent): RecentEvent {
  return {
    ...event,
    body: "",
    bodyContent: undefined,
    media: (event.media || []).filter((item) => item.id === event.coverImageId || item.id === event.image?.id).slice(0, 1),
    presentation: event.newsletterFormat === "presentation" && event.presentation
      ? { ...event.presentation, outline: [] }
      : undefined,
  };
}

export const onRequestGet: PagesFunction<StorageEnv> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const content = await readEditableContentFromStorage(env);
    const events = publicEvents(content.recentEvents);
    const slug = (url.searchParams.get("slug") || "").trim();
    if (slug) {
      const index = events.findIndex((event) => event.slug === slug || event.slugHistory?.includes(slug));
      if (index < 0) return jsonResponse({ error: "Newsletter not found." }, 404, { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" });
      const article = events[index];
      const relatedIds = new Set(article.relatedNewsletterIds || []);
      const related = events.filter((event) => event.id !== article.id && (
        relatedIds.has(event.id)
        || event.category === article.category
        || (event.tags || []).some((tag) => (article.tags || []).includes(tag))
      )).slice(0, 6);
      const context = [events[index - 1], article, events[index + 1], ...related]
        .filter((event): event is RecentEvent => Boolean(event))
        .filter((event, position, list) => list.findIndex((candidate) => candidate.id === event.id) === position)
        .map((event) => event.id === article.id ? event : summary(event))
        .sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
      return jsonResponse({ article, updates: context }, 200, { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" });
    }

    const pageSize = 9;
    const requestedPage = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const query = (url.searchParams.get("q") || "").normalize("NFKC").trim().toLocaleLowerCase("und").slice(0, 120);
    const category = (url.searchParams.get("category") || "").slice(0, 80);
    const year = /^\d{4}$/.test(url.searchParams.get("year") || "") ? url.searchParams.get("year")! : "";
    const filtered = events.filter((event) => {
      if (category && event.category !== category) return false;
      if (year && !event.date.startsWith(year)) return false;
      return !query || [event.title, event.summary, event.body, ...(event.tags || [])].join(" ").toLocaleLowerCase("und").includes(query);
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const items = filtered.slice((page - 1) * pageSize, page * pageSize).map(summary);
    const featured = [...events].sort((left, right) => Number(Boolean(right.featured)) - Number(Boolean(left.featured)) || Date.parse(right.date) - Date.parse(left.date))[0];
    return jsonResponse({
      newsletters: items,
      featured: featured ? summary(featured) : null,
      categories: [...new Set(events.map((event) => event.category).filter(Boolean))],
      years: [...new Set(events.map((event) => event.date.slice(0, 4)).filter((value) => /^\d{4}$/.test(value)))].sort().reverse(),
      pagination: { page, pageSize, total: filtered.length, totalPages },
    }, 200, { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" });
  } catch {
    return jsonResponse({ error: "Newsletters are temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
};
