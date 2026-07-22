import { getAuthorizedAdminSession, isRenShinKanSuperAdmin, jsonResponse } from "../../../_lib/auth";
import { requireStudentDb, type StudentEnv } from "../../../_lib/studentRecords";
import type { R2Bucket } from "../../../_lib/storage";

type Env = StudentEnv & { SESSION_SECRET?: string; MEDIA_BUCKET?: R2Bucket };

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  if (!env.MEDIA_BUCKET) return jsonResponse({ error: "Payment-proof storage is unavailable." }, 503);
  const db = requireStudentDb(env);
  const scope = isRenShinKanSuperAdmin(session) ? "" : "AND s.dojo_id = ? AND p.payment_type <> 'renshinkan_monthly'";
  const proof = await db.prepare(`SELECT p.id, p.object_key, p.content_type, p.original_filename
    FROM payment_proofs p JOIN students s ON s.id = p.student_id
    WHERE p.id = ? AND p.object_key IS NOT NULL ${scope} LIMIT 1`)
    .bind(String(params.id), ...(isRenShinKanSuperAdmin(session) ? [] : [session.selectedDojoId || "__none__"]))
    .first<{ id: string; object_key: string; content_type: string; original_filename: string }>();
  if (!proof) return jsonResponse({ error: "Payslip not found or outside your dojo." }, 404);
  const object = await env.MEDIA_BUCKET.get(proof.object_key);
  if (!object) {
    const now = new Date().toISOString();
    await db.prepare("UPDATE payment_proofs SET object_key = NULL, purged_at = ?, updated_at = ? WHERE id = ?").bind(now, now, proof.id).run();
    return jsonResponse({ error: "This payslip file is unavailable." }, 410);
  }
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": proof.content_type || "application/octet-stream",
    "Content-Disposition": `inline; filename="${proof.original_filename.replace(/["\\\r\n]/g, "_")}"`,
    "Content-Security-Policy": "sandbox",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  });
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { status: 200, headers });
};
