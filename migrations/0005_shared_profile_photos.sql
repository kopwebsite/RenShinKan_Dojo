PRAGMA foreign_keys = ON;

-- A reviewed self-service request may create at most one verified-hours entry,
-- including when two administrators act at nearly the same time.
ALTER TABLE training_hours ADD COLUMN hour_request_id TEXT
  REFERENCES training_hour_requests(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_training_hours_hour_request
  ON training_hours(hour_request_id)
  WHERE hour_request_id IS NOT NULL;

-- Approved profile photos are part of the verified student record opened by
-- owner QR links. The explicit image-consent flag remains the privacy gate.
UPDATE students
SET share_fields = json_set(
  CASE
    WHEN json_valid(share_fields) THEN share_fields
    ELSE '{"photo":true,"trainingHours":true,"examinations":true,"lastUpdated":true}'
  END,
  '$.photo',
  json('true')
);
