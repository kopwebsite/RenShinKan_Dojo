PRAGMA foreign_keys = ON;

-- A completion and a denial are mutually exclusive decisions. The immutable
-- request-decision claim handles two reviewers choosing an outcome at once;
-- this trigger also protects older or direct completion paths.
CREATE TRIGGER IF NOT EXISTS trg_denied_exam_cannot_be_completed
BEFORE UPDATE OF status ON examination_applications
WHEN NEW.status = 'examination_completed'
  AND EXISTS (
    SELECT 1 FROM request_decisions
    WHERE request_type = 'examination_application'
      AND request_id = NEW.id
      AND decision = 'denied'
  )
BEGIN
  SELECT RAISE(ABORT, 'denied examination application cannot be completed');
END;
