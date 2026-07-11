import type { R2Bucket } from "../../../../_lib/storage";
type Env = { MEDIA_BUCKET?: R2Bucket };
function one(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const year = one(params.year); const month = one(params.month); const file = one(params.file);
  if (!env.MEDIA_BUCKET || !/^\d{4}$/.test(year || "") || !/^\d{2}$/.test(month || "") || !/^[a-f0-9-]{36}\.webp$/i.test(file || "")) return new Response("Not found", { status: 404 });
  const object = await env.MEDIA_BUCKET.get(`student-profiles/${year}/${month}/${file}`);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({ "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600", "X-Robots-Tag": "noindex, nofollow", "Content-Security-Policy": "default-src 'none'" });
  return new Response(object.body, { headers });
};
