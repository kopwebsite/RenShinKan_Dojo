PRAGMA foreign_keys = ON;

-- All changes are additive. Existing student IDs, lookup hashes, public URLs,
-- share tokens, hours and examinations remain untouched.
ALTER TABLE students ADD COLUMN profile_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (profile_status IN ('pending_admin_approval', 'approved', 'rejected'));
ALTER TABLE students ADD COLUMN practice_duration TEXT NOT NULL DEFAULT '';
ALTER TABLE students ADD COLUMN profile_bio TEXT NOT NULL DEFAULT '';
ALTER TABLE students ADD COLUMN student_pin_hash TEXT;
ALTER TABLE students ADD COLUMN pending_profile_image_key TEXT;
ALTER TABLE students ADD COLUMN profile_review_note TEXT NOT NULL DEFAULT '';
ALTER TABLE students ADD COLUMN profile_reviewed_at TEXT;
ALTER TABLE students ADD COLUMN profile_reviewed_by TEXT;

ALTER TABLE belt_examinations ADD COLUMN rank_before TEXT;
ALTER TABLE belt_examinations ADD COLUMN rank_attempted TEXT;
ALTER TABLE belt_examinations ADD COLUMN passed INTEGER NOT NULL DEFAULT 1 CHECK (passed IN (0, 1));
ALTER TABLE belt_examinations ADD COLUMN examination_location TEXT;
ALTER TABLE belt_examinations ADD COLUMN rank_after TEXT;
ALTER TABLE belt_examinations ADD COLUMN administrator_id TEXT;
ALTER TABLE belt_examinations ADD COLUMN examination_timestamp TEXT;
ALTER TABLE belt_examinations ADD COLUMN bulk_operation_id TEXT;

ALTER TABLE share_tokens ADD COLUMN token_ciphertext TEXT;
ALTER TABLE share_tokens ADD COLUMN purpose TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE audit_log ADD COLUMN actor_type TEXT;
ALTER TABLE audit_log ADD COLUMN actor_identifier TEXT;
ALTER TABLE audit_log ADD COLUMN action TEXT;
ALTER TABLE audit_log ADD COLUMN entity_type TEXT;
ALTER TABLE audit_log ADD COLUMN entity_id TEXT;
ALTER TABLE audit_log ADD COLUMN student_id TEXT;
ALTER TABLE audit_log ADD COLUMN previous_values TEXT;
ALTER TABLE audit_log ADD COLUMN new_values TEXT;
ALTER TABLE audit_log ADD COLUMN source TEXT;
ALTER TABLE audit_log ADD COLUMN bulk_operation_id TEXT;
ALTER TABLE audit_log ADD COLUMN request_id TEXT;
ALTER TABLE audit_log ADD COLUMN administrator_note TEXT;

UPDATE audit_log
SET actor_type = COALESCE(actor_type, 'administrator'),
    actor_identifier = COALESCE(actor_identifier, 'legacy_admin'),
    action = COALESCE(action, admin_action),
    entity_type = COALESCE(entity_type, record_type),
    entity_id = COALESCE(entity_id, record_id),
    source = COALESCE(source, 'legacy_admin'),
    request_id = COALESCE(request_id, id)
WHERE actor_type IS NULL OR action IS NULL OR entity_type IS NULL;

CREATE TABLE IF NOT EXISTS examination_cycles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
  created_at TEXT NOT NULL,
  closed_at TEXT,
  closed_by TEXT
);

INSERT OR IGNORE INTO examination_cycles (id, name, status, created_at)
VALUES ('cycle-current', 'Upcoming belt examination', 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE IF NOT EXISTS examination_applications (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  cycle_id TEXT NOT NULL REFERENCES examination_cycles(id) ON DELETE RESTRICT,
  answers_json TEXT NOT NULL CHECK (json_valid(answers_json)),
  current_rank TEXT NOT NULL,
  attempted_rank TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'application_submitted'
    CHECK (status IN ('application_submitted', 'examination_completed', 'archived', 'rejected')),
  payment_status TEXT NOT NULL DEFAULT 'payment_pending'
    CHECK (payment_status IN ('payment_pending', 'paid')),
  administrator_notes TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  paid_at TEXT,
  paid_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_app_active_student_cycle
  ON examination_applications(student_id, cycle_id)
  WHERE status IN ('application_submitted', 'examination_completed');
CREATE INDEX IF NOT EXISTS idx_exam_app_status_payment
  ON examination_applications(status, payment_status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_app_student
  ON examination_applications(student_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS application_status_history (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES examination_applications(id) ON DELETE RESTRICT,
  previous_status TEXT,
  new_status TEXT,
  previous_payment_status TEXT,
  new_payment_status TEXT,
  actor_identifier TEXT NOT NULL,
  note TEXT,
  bulk_operation_id TEXT,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_application_history_application
  ON application_status_history(application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS training_hour_requests (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  submitted_hours REAL NOT NULL CHECK (submitted_hours > 0 AND submitted_hours <= 1000),
  previous_total REAL NOT NULL CHECK (previous_total >= 0),
  requested_total REAL NOT NULL CHECK (requested_total >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  review_note TEXT,
  request_id TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_training_hour_requests_status
  ON training_hour_requests(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_hour_requests_student
  ON training_hour_requests(student_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS student_access_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_student_access_sessions_student
  ON student_access_sessions(student_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  actor_hash TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  locked_until TEXT
);

CREATE TABLE IF NOT EXISTS mutation_requests (
  request_id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  action TEXT NOT NULL,
  response_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operation_failures (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  student_id TEXT,
  request_id TEXT NOT NULL,
  error_summary TEXT NOT NULL,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operation_failures_unresolved
  ON operation_failures(resolved_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_created
  ON audit_log(actor_type, actor_identifier, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_student_created
  ON audit_log(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_source
  ON audit_log(action, source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_bulk_operation
  ON audit_log(bulk_operation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_students_profile_status
  ON students(profile_status, updated_at DESC);
