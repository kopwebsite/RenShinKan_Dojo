import { jsonResponse } from "../../_lib/auth";
import { requireStudentDb, type StudentEnv } from "../../_lib/studentRecords";
import { type R2Bucket } from "../../_lib/storage";

type Env = StudentEnv & { MEDIA_BUCKET?: R2Bucket };

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const slug = String(params.slug || "").slice(0, 120);
  const asset = await requireStudentDb(env).prepare(`SELECT title_en, object_key
    FROM download_assets WHERE slug = ? AND published = 1 AND object_key IS NOT NULL LIMIT 1`)
    .bind(slug).first<{ title_en: string; object_key: string }>();
  if (!asset) return jsonResponse({ error: "Download not found." }, 404, { "Cache-Control": "no-store" });
  if (!env.MEDIA_BUCKET) return jsonResponse({ error: "Download storage is unavailable." }, 503, { "Cache-Control": "no-store" });
  const object = await env.MEDIA_BUCKET.get(asset.object_key);
  if (!object) return jsonResponse({ error: "Download file not found." }, 404, { "Cache-Control": "no-store" });
  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${slug}.pdf"`,
    "Cache-Control": "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
};
