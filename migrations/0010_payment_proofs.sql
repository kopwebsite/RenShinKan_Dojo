CREATE TABLE IF NOT EXISTS payment_proofs (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  dojo_id TEXT NOT NULL REFERENCES dojos(id) ON DELETE RESTRICT,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('exam', 'aat_annual', 'renshinkan_monthly')),
  payment_reference_id TEXT NOT NULL,
  upload_token_hash TEXT NOT NULL,
  object_key TEXT,
  original_filename TEXT,
  content_type TEXT,
  file_size INTEGER CHECK (file_size IS NULL OR (file_size > 0 AND file_size <= 5242880)),
  status TEXT NOT NULL DEFAULT 'awaiting_upload'
    CHECK (status IN ('awaiting_upload', 'pending_review', 'approved', 'denied')),
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  expires_at TEXT,
  purged_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(payment_type, payment_reference_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_dojo_status
  ON payment_proofs(dojo_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_student
  ON payment_proofs(student_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_expiry
  ON payment_proofs(expires_at, purged_at)
  WHERE object_key IS NOT NULL;
