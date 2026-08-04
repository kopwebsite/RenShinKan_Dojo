PRAGMA foreign_keys = ON;

-- Permanent student deletion ("delete forever") erases a record that should
-- never have existed. Archiving stays the normal path and is unchanged.
--
-- Two database rules previously made a complete erase impossible:
--   1. Related tables use ON DELETE RESTRICT, so the student row cannot go
--      until every child row is removed first. The application deletes them in
--      dependency order inside one D1 batch (a single transaction).
--   2. aat_membership_payments and payment_history carry immutability triggers
--      that abort every DELETE. A student who ever had a payment therefore
--      could not be erased at all.
--
-- The unlock table below is empty at all times except inside one permanent
-- deletion transaction. The immutability triggers keep aborting every other
-- delete, so ordinary financial history stays as immutable as before.
--
-- The unlock names the one student being erased, and the triggers only stand
-- aside for that student's own rows. A row left behind by a future bug can
-- therefore never expose anybody else's financial history, and a deletion can
-- never reach past its own target.
CREATE TABLE IF NOT EXISTS permanent_deletion_unlock (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

DROP TRIGGER IF EXISTS trg_aat_membership_history_immutable_delete;
CREATE TRIGGER trg_aat_membership_history_immutable_delete
BEFORE DELETE ON aat_membership_payments
WHEN NOT EXISTS (
  SELECT 1 FROM permanent_deletion_unlock u WHERE u.student_id = OLD.student_id
)
BEGIN
  SELECT RAISE(ABORT, 'aat_membership_history_is_immutable');
END;

-- payment_history has no student of its own; it inherits the one on the payment
-- it belongs to. History rows are always removed while that payment row still
-- exists, so this lookup resolves during the deletion transaction.
DROP TRIGGER IF EXISTS trg_payment_history_immutable_delete;
CREATE TRIGGER trg_payment_history_immutable_delete
BEFORE DELETE ON payment_history
WHEN NOT EXISTS (
  SELECT 1 FROM permanent_deletion_unlock u
  WHERE u.student_id = (SELECT p.student_id FROM payments p WHERE p.id = OLD.payment_id)
)
BEGIN
  SELECT RAISE(ABORT, 'payment_history_is_immutable');
END;

-- The proof that a deletion happened. Deliberately holds no name, no public
-- student ID and no student row ID: the point of delete forever is that the
-- person leaves no trace, while the administration keeps an accountable record
-- of who erased how much and when.
CREATE TABLE IF NOT EXISTS student_deletion_records (
  id TEXT PRIMARY KEY,
  deleted_by TEXT NOT NULL,
  deleted_by_role TEXT NOT NULL CHECK (deleted_by_role IN ('dojo_admin', 'renshinkan_super_admin')),
  dojo_id TEXT NOT NULL REFERENCES dojos(id) ON DELETE RESTRICT,
  records_removed INTEGER NOT NULL DEFAULT 0 CHECK (records_removed >= 0),
  files_removed INTEGER NOT NULL DEFAULT 0 CHECK (files_removed >= 0),
  audit_entries_redacted INTEGER NOT NULL DEFAULT 0 CHECK (audit_entries_redacted >= 0),
  request_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_student_deletion_records_created
  ON student_deletion_records(created_at DESC);

-- Audit rows that survive a permanent deletion are stripped of the person's
-- name and student ID, and no longer point at a student row that is gone.
CREATE INDEX IF NOT EXISTS idx_audit_log_student_scrub
  ON audit_log(student_id) WHERE student_id IS NOT NULL;
