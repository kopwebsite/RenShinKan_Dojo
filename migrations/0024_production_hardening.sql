PRAGMA foreign_keys = ON;

-- Compatibility accounts bind shared environment credentials to immutable,
-- server-assigned identities. Password hashes remain in encrypted bindings
-- until individual account enrollment is released.
CREATE TABLE IF NOT EXISTS admin_accounts (
  id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('central', 'dojo')),
  password_hash TEXT,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  mfa_state TEXT NOT NULL DEFAULT 'not_enrolled' CHECK (mfa_state IN ('not_enrolled', 'enrolled', 'recovery_required')),
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_account_dojos (
  account_id TEXT NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
  dojo_id TEXT NOT NULL REFERENCES dojos(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, dojo_id)
);
CREATE INDEX IF NOT EXISTS idx_admin_account_dojos_dojo ON admin_account_dojos(dojo_id, account_id);

CREATE TABLE IF NOT EXISTS student_private_access (
  student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  issued_by_account_id TEXT,
  revoked_at TEXT,
  last_used_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_student_private_access_active
  ON student_private_access(student_id, revoked_at);

CREATE TABLE IF NOT EXISTS security_rate_limits (
  endpoint TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_started_at TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  locked_until TEXT,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (endpoint, key_hash)
);
CREATE INDEX IF NOT EXISTS idx_security_rate_limits_expiry ON security_rate_limits(expires_at);
CREATE INDEX IF NOT EXISTS idx_security_rate_limits_lock ON security_rate_limits(endpoint, locked_until);

CREATE TABLE IF NOT EXISTS publish_operations (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  revision_number INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'publishing', 'published', 'failed', 'superseded')),
  stage TEXT NOT NULL,
  payload_key TEXT NOT NULL UNIQUE,
  payload_sha256 TEXT NOT NULL,
  source_revision_id TEXT REFERENCES site_revisions(id) ON DELETE SET NULL,
  requested_by_account_id TEXT,
  requested_by_name TEXT NOT NULL,
  error_code TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_publish_operations_status ON publish_operations(status, updated_at);

-- Query-driven indexes for the bounded administration queues and histories.
CREATE INDEX IF NOT EXISTS idx_students_dojo_profile_active
  ON students(dojo_id, profile_status, active, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_hour_requests_queue
  ON training_hour_requests(status, student_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_examination_applications_queue
  ON examination_applications(status, payment_status, cycle_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_queue
  ON payment_proofs(status, payment_type, dojo_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_request ON audit_log(request_id, created_at DESC);
