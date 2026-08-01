-- Capacity-review indexes for bounded administrative lists and payment joins.
-- These complement the broader indexes from earlier migrations with the exact
-- leading columns used by scoped, paginated production queries.

CREATE INDEX IF NOT EXISTS idx_students_dojo_active_profile_name
  ON students(dojo_id, active, profile_status, display_name COLLATE NOCASE, public_student_id COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_exam_cycle_status_cycle_state_name
  ON exam_cycle_student_status(cycle_id, status, student_name_snapshot COLLATE NOCASE, student_public_id_snapshot COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_contribution_roster_month_active_name
  ON contribution_period_students(month_key, active_at_period_start, student_name_snapshot COLLATE NOCASE, student_public_id_snapshot COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_payments_student_type_status_date
  ON payments(student_id, payment_type, status, payment_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_items_request_status_student
  ON payment_request_items(payment_request_id, status, student_id);

CREATE INDEX IF NOT EXISTS idx_payment_items_reference_student_request
  ON payment_request_items(payment_reference_id, student_id, payment_request_id);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_submitted_page
  ON payment_proofs(submitted_at DESC, id DESC)
  WHERE object_key IS NOT NULL AND submitted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_type_status_student
  ON payments(payment_type, status, student_id);

CREATE INDEX IF NOT EXISTS idx_monthly_contributions_status_student
  ON monthly_contributions(status, student_id);
