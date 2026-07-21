import { randomToken, sha256Hex, type D1Database, type D1PreparedStatement } from "./studentRecords";
import type { R2Bucket } from "./storage";

export type PaymentProofType = "exam" | "aat_annual" | "renshinkan_monthly";

export const PAYMENT_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PAYMENT_PROOF_RETENTION_DAYS = 60;

export async function createPaymentProofDraft(db: D1Database, input: {
  studentId: string;
  dojoId: string;
  paymentType: PaymentProofType;
  paymentReferenceId: string;
  createdAt: string;
}) {
  const proofId = crypto.randomUUID();
  const uploadToken = randomToken();
  const uploadTokenHash = await sha256Hex(uploadToken);
  const statement = db.prepare(`INSERT INTO payment_proofs (
    id, student_id, dojo_id, payment_type, payment_reference_id, upload_token_hash,
    status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, 'awaiting_upload', ?, ?)
  ON CONFLICT(payment_type, payment_reference_id) DO UPDATE SET
    id = excluded.id,
    student_id = excluded.student_id,
    dojo_id = excluded.dojo_id,
    upload_token_hash = excluded.upload_token_hash,
    object_key = NULL,
    original_filename = NULL,
    content_type = NULL,
    file_size = NULL,
    status = 'awaiting_upload',
    submitted_at = NULL,
    reviewed_at = NULL,
    reviewed_by = NULL,
    review_note = '',
    expires_at = NULL,
    purged_at = NULL,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at`)
    .bind(proofId, input.studentId, input.dojoId, input.paymentType, input.paymentReferenceId, uploadTokenHash, input.createdAt, input.createdAt);
  return { proofId, uploadToken, statement };
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

export async function validatePaymentProofImage(file: File) {
  const formats = new Map([
    ["image/jpeg", { extension: ".jpg", valid: (bytes: Uint8Array) => startsWith(bytes, [0xff, 0xd8, 0xff]) }],
    ["image/png", { extension: ".png", valid: (bytes: Uint8Array) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }],
    ["image/webp", { extension: ".webp", valid: (bytes: Uint8Array) => startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.slice(8), [0x57, 0x45, 0x42, 0x50]) }],
  ]);
  const format = formats.get(file.type);
  if (!format) throw new Error("Choose a JPEG, PNG, or WebP payslip image.");
  if (file.size <= 0 || file.size > PAYMENT_PROOF_MAX_BYTES) throw new Error("Payslip images must be 5 MB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!format.valid(bytes)) throw new Error("The selected file does not match its image type.");
  return { bytes, extension: format.extension, contentType: file.type };
}

export function paymentProofExpiry(uploadedAt: Date) {
  return new Date(uploadedAt.getTime() + PAYMENT_PROOF_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function purgeExpiredPaymentProofs(db: D1Database, bucket: R2Bucket | undefined, now = new Date().toISOString()) {
  if (!bucket) return 0;
  const rows = (await db.prepare(`SELECT id, object_key FROM payment_proofs
    WHERE object_key IS NOT NULL AND purged_at IS NULL AND expires_at <= ?
    ORDER BY expires_at ASC LIMIT 100`).bind(now).all<{ id: string; object_key: string }>()).results || [];
  if (!rows.length) return 0;
  await bucket.delete(rows.map((row) => row.object_key));
  const statements: D1PreparedStatement[] = rows.map((row) => db.prepare(`UPDATE payment_proofs
    SET object_key = NULL, purged_at = ?, updated_at = ? WHERE id = ?`).bind(now, now, row.id));
  await db.batch(statements);
  return rows.length;
}
