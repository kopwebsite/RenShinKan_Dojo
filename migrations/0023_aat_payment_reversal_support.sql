-- Preserve imported AAT history while making every entry addressable by the
-- general payment ledger. These inserts are additive and safe to replay.
INSERT OR IGNORE INTO payments (
  id, student_id, dojo_id, payment_type, amount, currency, payment_date,
  status, reference, notes, recorded_by, created_at, updated_at
)
SELECT
  ap.id, ap.student_id, ap.dojo_id, 'aat_annual', ap.amount, ap.currency,
  ap.payment_date, 'paid', 'AAT ' || ap.payment_date, ap.notes,
  ap.recorded_by, ap.created_at, ap.created_at
FROM aat_membership_payments ap
WHERE NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = ap.id);

INSERT OR IGNORE INTO payment_history (
  id, payment_id, previous_status, new_status, changed_by, notes, created_at
)
SELECT
  'aat-ledger-backfill:' || ap.id, ap.id, NULL, 'paid', 'migration',
  'Backfilled from immutable AAT membership payment history', ap.created_at
FROM aat_membership_payments ap
WHERE EXISTS (SELECT 1 FROM payments p WHERE p.id = ap.id)
  AND NOT EXISTS (SELECT 1 FROM payment_history ph WHERE ph.payment_id = ap.id);

-- A paid ledger entry can only be reversed once. The immutable payment history
-- and audit log retain who made the change, when it happened, and why.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_history_one_cancellation
  ON payment_history(payment_id)
  WHERE new_status = 'cancelled';
