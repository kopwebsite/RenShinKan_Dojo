import { jsonResponse } from "../_lib/auth";
import { requireStudentDb, type StudentEnv } from "../_lib/studentRecords";

export const onRequestGet: PagesFunction<StudentEnv> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const pageSize = 40;
    const db = requireStudentDb(env);
    const total = Number((await db.prepare("SELECT COUNT(*) AS total FROM download_assets WHERE published = 1")
      .first<{ total: number }>())?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const rows = await db.prepare(`SELECT slug, title_en, title_th, description_en, description_th,
      language_label, file_kind, static_path, object_key, file_size, page_count, updated_at
      , category_label, rank_label
      FROM download_assets
      WHERE published = 1
      ORDER BY sort_order ASC, updated_at DESC, id ASC LIMIT ? OFFSET ?`)
      .bind(pageSize, (safePage - 1) * pageSize).all();
    return jsonResponse({
      downloads: (rows.results || []).map((row) => {
        const asset = row as Record<string, unknown>;
        return {
          ...asset,
          url: asset.static_path || `/api/downloads/${encodeURIComponent(String(asset.slug))}`,
        };
      }),
      pagination: { page: safePage, pageSize, total, totalPages },
    }, 200, { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" });
  } catch {
    return jsonResponse({ error: "Downloads are temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
};
