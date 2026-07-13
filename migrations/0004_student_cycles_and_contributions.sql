PRAGMA foreign_keys = ON;

-- This migration is intentionally additive. Student, examination, training,
-- sharing, and audit history remain in place while the live workflows move to
-- cycle and calendar-month snapshot tables.

ALTER TABLE students ADD COLUMN archived_at TEXT;
ALTER TABLE students ADD COLUMN archived_by TEXT;
ALTER TABLE students ADD COLUMN public_visible_before_archive INTEGER
  CHECK (public_visible_before_archive IN (0, 1));

-- Legacy access-hash columns are retained only because removing columns from
-- the production D1 table would require a destructive table rebuild. Their
-- values are scrubbed and application code no longer uses them.
UPDATE students SET lookup_code_hash = '', student_pin_hash = NULL;

CREATE TABLE IF NOT EXISTS schema_deprecations (
  object_name TEXT PRIMARY KEY,
  deprecated_at TEXT NOT NULL,
  replacement TEXT NOT NULL,
  note TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_deprecations (object_name, deprecated_at, replacement, note)
VALUES
  (
    'students.lookup_code_hash',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    'Student ID plus forgiving name match',
    'Value scrubbed; column retained for migration safety only.'
  ),
  (
    'students.student_pin_hash',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    'Student ID plus short-lived verified access session',
    'Value scrubbed; column retained for migration safety only.'
  );

ALTER TABLE examination_applications ADD COLUMN student_name_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE examination_applications ADD COLUMN student_public_id_snapshot TEXT NOT NULL DEFAULT '';

UPDATE examination_applications
SET student_name_snapshot = COALESCE(
      NULLIF(student_name_snapshot, ''),
      (SELECT display_name FROM students WHERE students.id = examination_applications.student_id),
      'Student record'
    ),
    student_public_id_snapshot = COALESCE(
      NULLIF(student_public_id_snapshot, ''),
      (SELECT public_student_id FROM students WHERE students.id = examination_applications.student_id),
      'Unknown ID'
    )
WHERE student_name_snapshot = '' OR student_public_id_snapshot = '';

CREATE TABLE IF NOT EXISTS exam_cycle_student_status (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  cycle_id TEXT NOT NULL REFERENCES examination_cycles(id) ON DELETE RESTRICT,
  application_id TEXT REFERENCES examination_applications(id) ON DELETE RESTRICT,
  student_name_snapshot TEXT NOT NULL,
  student_public_id_snapshot TEXT NOT NULL,
  current_rank_snapshot TEXT NOT NULL,
  requested_rank_snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'not_signed_up'
    CHECK (status IN ('not_signed_up', 'unpaid', 'paid')),
  application_date TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  UNIQUE(student_id, cycle_id)
);

INSERT OR IGNORE INTO exam_cycle_student_status (
  id, student_id, cycle_id, application_id, student_name_snapshot,
  student_public_id_snapshot, current_rank_snapshot, requested_rank_snapshot,
  status, application_date, updated_at, updated_by
)
SELECT
  ea.id || ':cycle-status',
  ea.student_id,
  ea.cycle_id,
  ea.id,
  COALESCE(NULLIF(ea.student_name_snapshot, ''), s.display_name),
  COALESCE(NULLIF(ea.student_public_id_snapshot, ''), s.public_student_id),
  ea.current_rank,
  ea.attempted_rank,
  CASE WHEN ea.payment_status = 'paid' THEN 'paid' ELSE 'unpaid' END,
  ea.submitted_at,
  ea.updated_at,
  COALESCE(ea.paid_by, ea.student_id)
FROM examination_applications ea
JOIN students s ON s.id = ea.student_id;

INSERT OR IGNORE INTO exam_cycle_student_status (
  id, student_id, cycle_id, student_name_snapshot, student_public_id_snapshot,
  current_rank_snapshot, status, updated_at, updated_by
)
SELECT
  ec.id || ':' || s.id,
  s.id,
  ec.id,
  s.display_name,
  s.public_student_id,
  s.current_belt,
  'not_signed_up',
  ec.created_at,
  'system'
FROM examination_cycles ec
JOIN students s ON s.active = 1 AND s.profile_status = 'approved'
WHERE ec.status = 'active';

CREATE INDEX IF NOT EXISTS idx_exam_cycle_status_cycle_status
  ON exam_cycle_student_status(cycle_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_cycle_status_student
  ON exam_cycle_student_status(student_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_exam_cycle_status_public_id
  ON exam_cycle_student_status(student_public_id_snapshot COLLATE NOCASE, cycle_id);

CREATE TABLE IF NOT EXISTS exam_cycle_status_history (
  id TEXT PRIMARY KEY,
  cycle_status_id TEXT NOT NULL REFERENCES exam_cycle_student_status(id) ON DELETE RESTRICT,
  previous_status TEXT,
  new_status TEXT NOT NULL CHECK (new_status IN ('not_signed_up', 'unpaid', 'paid')),
  actor_identifier TEXT NOT NULL,
  bulk_operation_id TEXT,
  request_id TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exam_cycle_status_history_record
  ON exam_cycle_status_history(cycle_status_id, created_at DESC);

CREATE TABLE IF NOT EXISTS contribution_periods (
  month_key TEXT PRIMARY KEY CHECK (month_key GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  active_student_count_snapshot INTEGER NOT NULL DEFAULT 0 CHECK (active_student_count_snapshot >= 0),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contribution_period_students (
  id TEXT PRIMARY KEY,
  month_key TEXT NOT NULL REFERENCES contribution_periods(month_key) ON DELETE RESTRICT,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  student_name_snapshot TEXT NOT NULL,
  student_public_id_snapshot TEXT NOT NULL,
  current_rank_snapshot TEXT NOT NULL,
  active_at_period_start INTEGER NOT NULL DEFAULT 1 CHECK (active_at_period_start IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE(month_key, student_id)
);

CREATE INDEX IF NOT EXISTS idx_contribution_period_students_month
  ON contribution_period_students(month_key, active_at_period_start, student_name_snapshot COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_contribution_period_students_public_id
  ON contribution_period_students(student_public_id_snapshot COLLATE NOCASE, month_key);

CREATE TABLE IF NOT EXISTS monthly_contributions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  month_key TEXT NOT NULL REFERENCES contribution_periods(month_key) ON DELETE RESTRICT,
  student_name_snapshot TEXT NOT NULL,
  student_public_id_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('no_submission', 'awaiting_payment', 'paid')),
  submitted_at TEXT,
  paid_at TEXT,
  paid_by TEXT,
  status_updated_at TEXT NOT NULL,
  status_updated_by TEXT NOT NULL,
  internal_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(student_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_monthly_contributions_month_status
  ON monthly_contributions(month_key, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_monthly_contributions_student
  ON monthly_contributions(student_id, month_key DESC);
CREATE INDEX IF NOT EXISTS idx_monthly_contributions_created
  ON monthly_contributions(created_at DESC);

CREATE TABLE IF NOT EXISTS contribution_status_history (
  id TEXT PRIMARY KEY,
  contribution_id TEXT NOT NULL REFERENCES monthly_contributions(id) ON DELETE RESTRICT,
  previous_status TEXT,
  new_status TEXT NOT NULL CHECK (new_status IN ('no_submission', 'awaiting_payment', 'paid')),
  actor_identifier TEXT NOT NULL,
  bulk_operation_id TEXT,
  request_id TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contribution_status_history_record
  ON contribution_status_history(contribution_id, created_at DESC);

ALTER TABLE audit_log ADD COLUMN student_public_id_snapshot TEXT;
ALTER TABLE audit_log ADD COLUMN student_name_snapshot TEXT;
ALTER TABLE audit_log ADD COLUMN exam_cycle_id TEXT;
ALTER TABLE audit_log ADD COLUMN contribution_month TEXT;

UPDATE audit_log
SET student_public_id_snapshot = COALESCE(
      student_public_id_snapshot,
      (SELECT public_student_id FROM students WHERE students.id = audit_log.student_id)
    ),
    student_name_snapshot = COALESCE(
      student_name_snapshot,
      (SELECT display_name FROM students WHERE students.id = audit_log.student_id)
    )
WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_cycle_created
  ON audit_log(exam_cycle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_contribution_month_created
  ON audit_log(contribution_month, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_students_archived
  ON students(active, archived_at DESC);
