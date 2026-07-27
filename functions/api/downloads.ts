import { jsonResponse } from "../_lib/auth";
import { requireStudentDb, type StudentEnv } from "../_lib/studentRecords";

export const onRequestGet: PagesFunction<StudentEnv> = async ({ env }) => {
  try {
    const rows = await requireStudentDb(env).prepare(`SELECT slug, title_en, title_th, description_en, description_th,
      language_label, file_kind, static_path, object_key, file_size, page_count, updated_at
      , category_label, rank_label
      FROM download_assets
      WHERE published = 1
      ORDER BY sort_order ASC, updated_at DESC, id ASC`).all();
    return jsonResponse({
      downloads: (rows.results || []).map((row) => {
        const asset = row as Record<string, unknown>;
        return {
          ...asset,
          url: asset.static_path || `/api/downloads/${encodeURIComponent(String(asset.slug))}`,
        };
      }),
    }, 200, { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" });
  } catch {
    return jsonResponse({ error: "Downloads are temporarily unavailable." }, 503, { "Cache-Control": "no-store" });
  }
};
