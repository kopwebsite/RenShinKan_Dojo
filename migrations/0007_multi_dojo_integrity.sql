PRAGMA foreign_keys = ON;

-- Database-level guardrails complement Pages Function validation. These are
-- additive triggers; no production row is rewritten or deleted.
CREATE TRIGGER IF NOT EXISTS trg_students_require_dojo_insert
BEFORE INSERT ON students
WHEN NEW.dojo_id IS NULL OR NOT EXISTS (SELECT 1 FROM dojos WHERE id = NEW.dojo_id)
BEGIN
  SELECT RAISE(ABORT, 'student_dojo_required');
END;

CREATE TRIGGER IF NOT EXISTS trg_students_require_dojo_update
BEFORE UPDATE OF dojo_id ON students
WHEN NEW.dojo_id IS NULL OR NOT EXISTS (SELECT 1 FROM dojos WHERE id = NEW.dojo_id)
BEGIN
  SELECT RAISE(ABORT, 'student_dojo_required');
END;

CREATE TRIGGER IF NOT EXISTS trg_exam_applications_require_dojo_insert
BEFORE INSERT ON examination_applications
WHEN NEW.dojo_id IS NULL OR NEW.dojo_id <> (SELECT dojo_id FROM students WHERE id = NEW.student_id)
BEGIN
  SELECT RAISE(ABORT, 'examination_application_dojo_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_monthly_payments_renshinkan_only_insert
BEFORE INSERT ON payments
WHEN NEW.payment_type = 'renshinkan_monthly' AND NEW.dojo_id <> 'dojo-rsk'
BEGIN
  SELECT RAISE(ABORT, 'renshinkan_monthly_contribution_not_eligible');
END;

CREATE TRIGGER IF NOT EXISTS trg_aat_membership_history_immutable_update
BEFORE UPDATE ON aat_membership_payments
BEGIN
  SELECT RAISE(ABORT, 'aat_membership_history_is_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_aat_membership_history_immutable_delete
BEFORE DELETE ON aat_membership_payments
BEGIN
  SELECT RAISE(ABORT, 'aat_membership_history_is_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_history_immutable_update
BEFORE UPDATE ON payment_history
BEGIN
  SELECT RAISE(ABORT, 'payment_history_is_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_history_immutable_delete
BEFORE DELETE ON payment_history
BEGIN
  SELECT RAISE(ABORT, 'payment_history_is_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_site_revisions_immutable_update
BEFORE UPDATE ON site_revisions
BEGIN
  SELECT RAISE(ABORT, 'site_revision_is_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_site_revisions_immutable_delete
BEFORE DELETE ON site_revisions
BEGIN
  SELECT RAISE(ABORT, 'site_revision_is_immutable');
END;
