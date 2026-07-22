ALTER TABLE monthly_contributions ADD COLUMN payment_group_id TEXT;
ALTER TABLE monthly_contributions ADD COLUMN expected_amount INTEGER
  CHECK (expected_amount IS NULL OR expected_amount >= 0);

CREATE INDEX IF NOT EXISTS idx_monthly_contributions_payment_group
  ON monthly_contributions(payment_group_id)
  WHERE payment_group_id IS NOT NULL;
