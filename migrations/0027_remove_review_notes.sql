PRAGMA foreign_keys = ON;

-- Review explanations and private decision notes are no longer collected.
-- D1 columns are retained for safe forward-only migrations, but all stored
-- values are erased and application code no longer writes or displays them.
UPDATE students
SET profile_review_note = '', profile_student_visible_note = '', profile_internal_note = '';

UPDATE training_hour_requests
SET review_note = '', student_visible_note = '', internal_admin_note = '';

UPDATE examination_applications
SET administrator_notes = '', student_visible_decision_note = '', internal_admin_note = '';

UPDATE payment_proofs
SET review_note = '', student_visible_note = '', internal_admin_note = '';

UPDATE request_decisions
SET student_visible_note = '', internal_admin_note = '';

UPDATE monthly_contributions SET internal_note = '';
UPDATE training_hours SET internal_note = NULL WHERE internal_note IS NOT NULL;
UPDATE belt_examinations SET internal_notes = NULL WHERE internal_notes IS NOT NULL;

INSERT OR REPLACE INTO schema_deprecations (object_name, deprecated_at, replacement, note)
VALUES
  ('students.profile_review_note', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'audit_log decision event', 'Value erased; review-note UI and writes removed.'),
  ('students.profile_student_visible_note', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'request status only', 'Value erased; denial explanations are no longer collected.'),
  ('students.profile_internal_note', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'audit_log decision event', 'Value erased; private decision notes are no longer collected.'),
  ('training_hour_requests.review_note', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'request status only', 'Value erased; review-note UI and writes removed.'),
  ('training_hour_requests.student_visible_note', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'request status only', 'Value erased; denial explanations are no longer collected.'),
  ('training_hour_requests.internal_admin_note', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'audit_log decision event', 'Value erased; private decision notes are no longer collected.'),
  ('examination_applications.administrator_notes', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'application_status_history', 'Value erased; administrator note UI and writes removed.'),
  ('examination_applications.student_visible_decision_note', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'application status only', 'Value erased; denial explanations are no longer collected.'),
  ('examination_applications.internal_admin_note', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'audit_log decision event', 'Value erased; private decision notes are no longer collected.'),
  ('payment_proofs.review_note', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'payment proof status only', 'Value erased; review-note UI and writes removed.'),
  ('payment_proofs.student_visible_note', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'payment proof status only', 'Value erased; denial explanations are no longer collected.'),
  ('payment_proofs.internal_admin_note', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'audit_log decision event', 'Value erased; private decision notes are no longer collected.'),
  ('request_decisions.student_visible_note', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'decision status', 'Value erased; denial explanations are no longer collected.'),
  ('request_decisions.internal_admin_note', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'audit_log decision event', 'Value erased; private decision notes are no longer collected.'),
  ('monthly_contributions.internal_note', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'audit_log status event', 'Value erased; internal-note UI and writes removed.');
