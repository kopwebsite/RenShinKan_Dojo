import { isSameOriginRequest, jsonResponse } from "../_lib/auth";
import { paymentProofExpiry, purgeExpiredPaymentProofs, validatePaymentProofImage } from "../_lib/paymentProofs";
import { auditStatement, requestIdentifier, requireStudentDb, sha256Hex, type StudentEnv } from "../_lib/studentRecords";
import type { R2Bucket } from "../_lib/storage";

type Env = StudentEnv & { MEDIA_BUCKET?: R2Bucket };

function isFile(value: FormDataEntryValue | null): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "size" in value && "type" in value;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Forbidden" }, 403);
  if (!env.MEDIA_BUCKET) return jsonResponse({ error: "Payment-proof storage is unavailable." }, 503);
  const db = requireStudentDb(env);
  const requestId = requestIdentifier(request);
  let uploadedKey = "";
  try {
    await purgeExpiredPaymentProofs(db, env.MEDIA_BUCKET);
    const form = await request.formData();
    const proofId = String(form.get("proofId") || "").trim();
    const uploadToken = String(form.get("uploadToken") || "").trim();
    const file = form.get("file");
    if (!proofId || !uploadToken || !isFile(file)) return jsonResponse({ error: "Choose a payslip image to upload." }, 400);
    const tokenHash = await sha256Hex(uploadToken);
    const proof = await db.prepare(`SELECT id, student_id, payment_type, status, object_key
      FROM payment_proofs WHERE id = ? AND upload_token_hash = ? LIMIT 1`).bind(proofId, tokenHash)
      .first<{ id: string; student_id: string; payment_type: string; status: string; object_key: string | null }>();
    if (!proof) return jsonResponse({ error: "This payment-proof upload link is invalid or has expired." }, 403);
    if (proof.status === "approved") return jsonResponse({ error: "This payment has already been approved." }, 409);
    const validated = await validatePaymentProofImage(file);
    const uploadedAt = new Date();
    const now = uploadedAt.toISOString();
    const expiresAt = paymentProofExpiry(uploadedAt);
    uploadedKey = `payment-proofs/${uploadedAt.getUTCFullYear()}/${String(uploadedAt.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}${validated.extension}`;
    await env.MEDIA_BUCKET.put(uploadedKey, validated.bytes, {
      httpMetadata: { contentType: validated.contentType, cacheControl: "private, no-store" },
      customMetadata: { proofId, studentId: proof.student_id, paymentType: proof.payment_type, uploadedAt: now, expiresAt },
    });
    await db.batch([
      db.prepare(`UPDATE payment_proofs SET object_key = ?, original_filename = ?, content_type = ?, file_size = ?,
        status = 'pending_review', submitted_at = ?, reviewed_at = NULL, reviewed_by = NULL, review_note = '',
        expires_at = ?, purged_at = NULL, updated_at = ? WHERE id = ?`)
        .bind(uploadedKey, file.name.replace(/[^\x20-\x7e]/g, "_").slice(0, 240), validated.contentType, file.size, now, expiresAt, now, proofId),
      auditStatement(db, {
        actorType: "student", actorIdentifier: proof.student_id, action: "payment_proof_submitted", entityType: "payment_proof",
        entityId: proofId, studentId: proof.student_id, previousValues: { status: proof.status },
        newValues: { status: "pending_review", paymentType: proof.payment_type, expiresAt }, source: "student_payment_proof",
        requestId, summary: `Submitted payment proof for ${proof.payment_type.replace(/_/g, " ")}`, createdAt: now,
      }),
    ]);
    if (proof.object_key && proof.object_key !== uploadedKey) await env.MEDIA_BUCKET.delete(proof.object_key);
    uploadedKey = "";
    return jsonResponse({ ok: true, status: "pending_review", expiresAt }, 201, { "Cache-Control": "no-store" });
  } catch (error) {
    if (uploadedKey) await env.MEDIA_BUCKET.delete(uploadedKey).catch(() => undefined);
    return jsonResponse({ error: error instanceof Error ? error.message : "The payslip could not be uploaded." }, 400);
  }
};

export const onRequestGet: PagesFunction = async () => new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
