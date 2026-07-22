import { randomToken, sha256Hex, type D1Database } from "./studentRecords";

export type PaymentProofType = "exam" | "aat_annual" | "renshinkan_monthly";

export const PAYMENT_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PAYMENT_PROOF_UPLOAD_TOKEN_HOURS = 2;

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
    status, upload_token_expires_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, 'awaiting_upload', ?, ?, ?)
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
    student_visible_note = '',
    internal_admin_note = '',
    upload_token_expires_at = excluded.upload_token_expires_at,
    purged_at = NULL,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at`)
    .bind(
      proofId, input.studentId, input.dojoId, input.paymentType, input.paymentReferenceId, uploadTokenHash,
      new Date(Date.parse(input.createdAt) + PAYMENT_PROOF_UPLOAD_TOKEN_HOURS * 60 * 60 * 1000).toISOString(),
      input.createdAt, input.createdAt,
    );
  return { proofId, uploadToken, statement };
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

export async function validatePaymentProofFile(file: File) {
  const formats = new Map([
    ["image/jpeg", { extension: ".jpg", valid: (bytes: Uint8Array) => startsWith(bytes, [0xff, 0xd8, 0xff]) }],
    ["image/png", { extension: ".png", valid: (bytes: Uint8Array) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }],
    ["image/webp", { extension: ".webp", valid: (bytes: Uint8Array) => startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.slice(8), [0x57, 0x45, 0x42, 0x50]) }],
    ["application/pdf", { extension: ".pdf", valid: (bytes: Uint8Array) => startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]) }],
  ]);
  const format = formats.get(file.type);
  if (!format) throw new Error("Choose a JPEG, PNG, WebP, or PDF payslip.");
  if (file.size <= 0 || file.size > PAYMENT_PROOF_MAX_BYTES) throw new Error("Payslip files must be 5 MB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!format.valid(bytes)) throw new Error("The selected file does not match its image type.");
  return { bytes, extension: format.extension, contentType: file.type };
}
