-- New student IDs use the Gregorian year suffix. Existing IDs and the legacy
-- year-sequence table remain untouched for historical integrity.
CREATE TABLE IF NOT EXISTS dojo_student_gregorian_sequences (
  dojo_id TEXT NOT NULL,
  gregorian_year INTEGER NOT NULL CHECK (gregorian_year BETWEEN 1900 AND 9999),
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (dojo_id, gregorian_year),
  FOREIGN KEY (dojo_id) REFERENCES dojos(id)
);

CREATE INDEX IF NOT EXISTS idx_dojo_student_gregorian_sequences_year
  ON dojo_student_gregorian_sequences(gregorian_year, dojo_id);

-- Seed the new sequence from any Gregorian-format IDs that were already
-- assigned manually in the current year. This prevents a generated ID from
-- colliding with an existing identifier without renumbering any student.
WITH current_year(value) AS (
  SELECT CAST(strftime('%Y', 'now', '+7 hours') AS INTEGER)
)
INSERT INTO dojo_student_gregorian_sequences (
  dojo_id,
  gregorian_year,
  last_number,
  updated_at
)
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
ON CONFLICT(dojo_id, gregorian_year) DO UPDATE SET
  last_number = MAX(dojo_student_gregorian_sequences.last_number, excluded.last_number),
  updated_at = excluded.updated_at;
