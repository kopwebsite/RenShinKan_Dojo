import { getAuthorizedAdminSession, isRenShinKanSuperAdmin, jsonResponse } from "../../../_lib/auth";
import { purgeExpiredPaymentProofs } from "../../../_lib/paymentProofs";
import { requireStudentDb, type StudentEnv } from "../../../_lib/studentRecords";
import type { R2Bucket } from "../../../_lib/storage";

type Env = StudentEnv & { SESSION_SECRET?: string; MEDIA_BUCKET?: R2Bucket };

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const session = await getAuthorizedAdminSession(request, env);
  if (!session) return jsonResponse({ error: "Unauthorized" }, 401);
  if (!env.MEDIA_BUCKET) return jsonResponse({ error: "Payment-proof storage is unavailable." }, 503);
  const db = requireStudentDb(env);
  await purgeExpiredPaymentProofs(db, env.MEDIA_BUCKET);
  const scope = isRenShinKanSuperAdmin(session) ? "" : "AND s.dojo_id = ?";
  const proof = await db.prepare(`SELECT p.id, p.object_key, p.content_type, p.original_filename, p.expires_at
    FROM payment_proofs p JOIN students s ON s.id = p.student_id
    WHERE p.id = ? AND p.object_key IS NOT NULL AND p.expires_at > ? ${scope} LIMIT 1`)
    .bind(String(params.id), new Date().toISOString(), ...(isRenShinKanSuperAdmin(session) ? [] : [session.selectedDojoId || "__none__"]))
    .first<{ id: string; object_key: string; content_type: string; original_filename: string; expires_at: string }>();
  if (!proof) return jsonResponse({ error: "Payslip not found, expired, or outside your dojo." }, 404);
  const object = await env.MEDIA_BUCKET.get(proof.object_key);
  if (!object) {
    const now = new Date().toISOString();
    await db.prepare("UPDATE payment_proofs SET object_key = NULL, purged_at = ?, updated_at = ? WHERE id = ?").bind(now, now, proof.id).run();
    return jsonResponse({ error: "This payslip image has expired." }, 410);
  }
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": proof.content_type || "application/octet-stream",
    "Content-Disposition": `inline; filename="${proof.original_filename.replace(/["\\\r\n]/g, "_")}"`,
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  });
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { status: 200, headers });
};
