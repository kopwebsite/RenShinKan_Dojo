PRAGMA foreign_keys = ON;

-- Student-visible explanations and private administrator notes are separate at
-- rest. Legacy review fields are conservatively treated as private because the
-- application cannot prove they were written for student disclosure.
ALTER TABLE students ADD COLUMN profile_student_visible_note TEXT NOT NULL DEFAULT '';
ALTER TABLE students ADD COLUMN profile_internal_note TEXT NOT NULL DEFAULT '';
UPDATE students
SET profile_internal_note = COALESCE(NULLIF(profile_internal_note, ''), profile_review_note, '')
WHERE COALESCE(profile_review_note, '') <> '';

ALTER TABLE training_hour_requests ADD COLUMN student_visible_note TEXT NOT NULL DEFAULT '';
ALTER TABLE training_hour_requests ADD COLUMN internal_admin_note TEXT NOT NULL DEFAULT '';
UPDATE training_hour_requests
SET internal_admin_note = COALESCE(NULLIF(internal_admin_note, ''), review_note, '')
WHERE COALESCE(review_note, '') <> '';

ALTER TABLE examination_applications ADD COLUMN student_visible_decision_note TEXT NOT NULL DEFAULT '';
ALTER TABLE examination_applications ADD COLUMN internal_admin_note TEXT NOT NULL DEFAULT '';
UPDATE examination_applications
SET internal_admin_note = COALESCE(NULLIF(internal_admin_note, ''), administrator_notes, '')
WHERE COALESCE(administrator_notes, '') <> '';

ALTER TABLE payment_proofs ADD COLUMN student_visible_note TEXT NOT NULL DEFAULT '';
ALTER TABLE payment_proofs ADD COLUMN internal_admin_note TEXT NOT NULL DEFAULT '';
ALTER TABLE payment_proofs ADD COLUMN upload_token_expires_at TEXT;
UPDATE payment_proofs
SET internal_admin_note = COALESCE(NULLIF(internal_admin_note, ''), review_note, '')
WHERE COALESCE(review_note, '') <> '';
UPDATE payment_proofs
SET upload_token_expires_at = datetime(COALESCE(submitted_at, created_at), '+2 hours')
WHERE upload_token_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_training_hour_requests_student_status
  ON training_hour_requests(student_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_app_student_status
  ON examination_applications(student_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_student_status
  ON payment_proofs(student_id, status, submitted_at DESC);

-- One immutable decision claim per reviewable request. The UNIQUE key makes
-- concurrent administrators race safely: D1 batch rolls back the losing
-- decision and every related data mutation.
CREATE TABLE IF NOT EXISTS request_decisions (
  id TEXT PRIMARY KEY,
  request_type TEXT NOT NULL CHECK (request_type IN ('profile_information', 'training_hours', 'examination_application', 'payslip')),
  request_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'denied')),
  reviewer_identifier TEXT NOT NULL,
  student_visible_note TEXT NOT NULL DEFAULT '',
  internal_admin_note TEXT NOT NULL DEFAULT '',
  decided_at TEXT NOT NULL,
  UNIQUE(request_type, request_id)
);

CREATE INDEX IF NOT EXISTS idx_request_decisions_reviewed
  ON request_decisions(decided_at DESC, request_type);

INSERT OR IGNORE INTO request_decisions
  (id, request_type, request_id, decision, reviewer_identifier, student_visible_note, internal_admin_note, decided_at)
SELECT 'backfill-profile-' || id, 'profile_information', id,
  CASE WHEN profile_status = 'approved' THEN 'approved' ELSE 'denied' END,
  COALESCE(NULLIF(profile_reviewed_by, ''), 'legacy_import'),
  COALESCE(profile_student_visible_note, ''), COALESCE(profile_internal_note, ''), profile_reviewed_at
FROM students
WHERE profile_reviewed_at IS NOT NULL AND profile_status IN ('approved', 'rejected');

INSERT OR IGNORE INTO request_decisions
  (id, request_type, request_id, decision, reviewer_identifier, student_visible_note, internal_admin_note, decided_at)
SELECT 'backfill-hours-' || id, 'training_hours', id,
  CASE WHEN status = 'approved' THEN 'approved' ELSE 'denied' END,
  COALESCE(NULLIF(reviewed_by, ''), 'legacy_import'),
  COALESCE(student_visible_note, ''), COALESCE(internal_admin_note, ''), reviewed_at
FROM training_hour_requests
WHERE reviewed_at IS NOT NULL AND status IN ('approved', 'rejected');

INSERT OR IGNORE INTO request_decisions
  (id, request_type, request_id, decision, reviewer_identifier, student_visible_note, internal_admin_note, decided_at)
SELECT 'backfill-payslip-' || id, 'payslip', id,
  CASE WHEN status = 'approved' THEN 'approved' ELSE 'denied' END,
  COALESCE(NULLIF(reviewed_by, ''), 'legacy_import'),
  COALESCE(student_visible_note, ''), COALESCE(internal_admin_note, ''), reviewed_at
FROM payment_proofs
WHERE reviewed_at IS NOT NULL AND status IN ('approved', 'denied');

INSERT OR IGNORE INTO request_decisions
  (id, request_type, request_id, decision, reviewer_identifier, student_visible_note, internal_admin_note, decided_at)
SELECT 'backfill-exam-' || id, 'examination_application', id,
  CASE WHEN status = 'rejected' THEN 'denied' ELSE 'approved' END,
  COALESCE(NULLIF(approved_by, ''), 'legacy_import'),
  COALESCE(student_visible_decision_note, ''), COALESCE(internal_admin_note, ''),
  COALESCE(completed_at, approved_at, updated_at)
FROM examination_applications
WHERE status IN ('rejected', 'examination_completed');

-- Logout and privilege changes can now invalidate an otherwise correctly
-- signed cookie. Only session identifiers are stored; cookie bodies and tokens
-- are never persisted.
CREATE TABLE IF NOT EXISTS revoked_admin_sessions (
  session_id TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  revoked_at TEXT NOT NULL,
  revoked_by TEXT NOT NULL,
  reason TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_admin_sessions_expiry
  ON revoked_admin_sessions(expires_at);
