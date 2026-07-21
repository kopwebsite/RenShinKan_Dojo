CREATE TABLE IF NOT EXISTS dojo_student_year_sequences (
  dojo_id TEXT NOT NULL REFERENCES dojos(id) ON DELETE RESTRICT,
  buddhist_year INTEGER NOT NULL CHECK (buddhist_year >= 2500),
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (dojo_id, buddhist_year)
);

CREATE INDEX IF NOT EXISTS idx_dojo_student_year_sequences_year
  ON dojo_student_year_sequences(buddhist_year, dojo_id);

-- Preserve any IDs already issued in the current Thai Buddhist year. Historical
-- IDs remain unchanged and the new composite key naturally starts each year at 01.
WITH current_year(value) AS (
  SELECT CAST(strftime('%Y', 'now', '+7 hours') AS INTEGER) + 543
)
INSERT INTO dojo_student_year_sequences (dojo_id, buddhist_year, last_number, updated_at)
SELECT d.id,
  y.value,
  COALESCE(MAX(CASE
    WHEN upper(s.public_student_id) LIKE upper(d.code) || '-' || printf('%02d', y.value % 100) || '%'
      AND length(s.public_student_id) >= length(d.code) + 5
      AND substr(s.public_student_id, length(d.code) + 4) NOT GLOB '*[^0-9]*'
    THEN CAST(substr(s.public_student_id, length(d.code) + 4) AS INTEGER)
    ELSE 0
  END), 0),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM dojos d
CROSS JOIN current_year y
LEFT JOIN students s ON s.dojo_id = d.id
GROUP BY d.id, y.value
ON CONFLICT(dojo_id, buddhist_year) DO UPDATE SET
  last_number = MAX(dojo_student_year_sequences.last_number, excluded.last_number),
  updated_at = excluded.updated_at;
