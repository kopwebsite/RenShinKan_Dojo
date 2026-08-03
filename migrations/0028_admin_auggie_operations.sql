PRAGMA foreign_keys = ON;

-- Admin Auggie never executes a write directly from model output. A model may
-- only prepare one of these short-lived, account/session/dojo-bound operations.
CREATE TABLE IF NOT EXISTS admin_ai_operations (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  selected_dojo_id TEXT NOT NULL REFERENCES dojos(id) ON DELETE RESTRICT,
  permission_level TEXT NOT NULL CHECK (permission_level IN ('dojo_admin', 'renshinkan_super_admin')),
  tool_name TEXT NOT NULL,
  tool_version INTEGER NOT NULL DEFAULT 1 CHECK (tool_version > 0),
  execution_mode TEXT NOT NULL CHECK (execution_mode IN ('direct', 'guided')),
  status TEXT NOT NULL CHECK (status IN ('prepared', 'guided', 'succeeded', 'failed', 'expired', 'undone', 'cancelled')),
  normalized_args_json TEXT NOT NULL,
  args_sha256 TEXT NOT NULL,
  preview_json TEXT NOT NULL,
  fingerprints_json TEXT NOT NULL,
  result_fingerprints_json TEXT,
  confirmation_sha256 TEXT,
  request_id TEXT NOT NULL,
  undo_of_operation_id TEXT REFERENCES admin_ai_operations(id) ON DELETE RESTRICT,
  undone_by_operation_id TEXT REFERENCES admin_ai_operations(id) ON DELETE RESTRICT,
  expires_at TEXT NOT NULL,
  undo_expires_at TEXT,
  confirmed_at TEXT,
  completed_at TEXT,
  result_json TEXT,
  error_code TEXT,
  payload_expires_at TEXT NOT NULL,
  payload_scrubbed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_ai_operations_actor
  ON admin_ai_operations(account_id, selected_dojo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_ai_operations_expiry
  ON admin_ai_operations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_ai_operations_payload_expiry
  ON admin_ai_operations(payload_scrubbed_at, payload_expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_ai_operations_undo
  ON admin_ai_operations(undo_of_operation_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_ai_operations_active_undo
  ON admin_ai_operations(undo_of_operation_id)
  WHERE undo_of_operation_id IS NOT NULL
    AND status IN ('prepared', 'succeeded');

-- The unique claim is inserted in the same D1 batch as the domain mutation.
-- A duplicate confirmation therefore rolls the whole second batch back before
-- it can change a student record.
CREATE TABLE IF NOT EXISTS admin_ai_execution_claims (
  operation_id TEXT PRIMARY KEY REFERENCES admin_ai_operations(id) ON DELETE CASCADE,
  claimed_at TEXT NOT NULL
);

-- Each direct execution inserts a guard whose observed state is calculated by
-- SQLite inside the mutation batch. CHECK failure makes a concurrent/stale
-- operation roll back, including its execution claim and audit statements.
CREATE TABLE IF NOT EXISTS admin_ai_execution_guards (
  operation_id TEXT NOT NULL REFERENCES admin_ai_operations(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  expected_state TEXT NOT NULL,
  observed_state TEXT NOT NULL,
  PRIMARY KEY (operation_id, target_id),
  CHECK (expected_state = observed_state)
);

-- Operation lifecycle guards are separate from student fingerprints so a
-- deadline-only CHECK failure can be identified and recorded as expiry rather
-- than as a stale student mutation.
CREATE TABLE IF NOT EXISTS admin_ai_operation_state_guards (
  operation_id TEXT NOT NULL REFERENCES admin_ai_operations(id) ON DELETE CASCADE,
  guard_name TEXT NOT NULL,
  expected_state TEXT NOT NULL,
  observed_state TEXT NOT NULL,
  PRIMARY KEY (operation_id, guard_name),
  CONSTRAINT admin_ai_operation_state_matches
    CHECK (expected_state = observed_state)
);
