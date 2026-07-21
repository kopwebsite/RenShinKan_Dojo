import { jsonResponse, RENSHINKAN_DOJO_ID } from "../_lib/auth";
import { requireStudentDb, type StudentEnv } from "../_lib/studentRecords";

export const onRequestGet: PagesFunction<StudentEnv> = async ({ env }) => {
  try {
    const db = requireStudentDb(env);
    const dojos = (await db.prepare(`SELECT id, official_name, short_name, code, logo_url, slug, sort_order
      FROM dojos WHERE active = 1
      ORDER BY CASE WHEN id = '${RENSHINKAN_DOJO_ID}' THEN 0 ELSE 1 END, sort_order, official_name COLLATE NOCASE`).all()).results || [];
    return jsonResponse({ dojos }, 200, { "Cache-Control": "public, max-age=300" });
  } catch {
    return jsonResponse({ error: "The dojo list is unavailable." }, 503, { "Cache-Control": "no-store" });
  }
};
