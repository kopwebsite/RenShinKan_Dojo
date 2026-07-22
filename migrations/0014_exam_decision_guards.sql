PRAGMA foreign_keys = ON;

-- Keep the examination decision and payment workflows mutually consistent
-- even if a payment reviewer and application reviewer act concurrently.
CREATE TRIGGER IF NOT EXISTS trg_exam_denial_requires_open_application
BEFORE INSERT ON request_decisions
WHEN NEW.request_type = 'examination_application'
  AND NEW.decision = 'denied'
  AND NOT EXISTS (
    SELECT 1 FROM examination_applications
    WHERE id = NEW.request_id
      AND status = 'application_submitted'
      AND payment_status <> 'paid'
  )
BEGIN
  SELECT RAISE(ABORT, 'examination application already processed');
END;

CREATE TRIGGER IF NOT EXISTS trg_rejected_exam_cannot_be_marked_paid
BEFORE UPDATE OF payment_status ON examination_applications
WHEN NEW.payment_status = 'paid'
  AND EXISTS (
    SELECT 1 FROM request_decisions
    WHERE request_type = 'examination_application'
      AND request_id = NEW.id
      AND decision = 'denied'
  )
BEGIN
  SELECT RAISE(ABORT, 'rejected examination application cannot be marked paid');
END;
