PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_rsk_verification_attempts (
  actor_hash TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  locked_until TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_rsk_verification_lockout
  ON admin_rsk_verification_attempts(locked_until);

ALTER TABLE audit_log ADD COLUMN outcome TEXT NOT NULL DEFAULT 'success'
  CHECK (outcome IN ('success', 'failure'));
