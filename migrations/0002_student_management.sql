PRAGMA foreign_keys = ON;

-- Additive migration: legacy lookup hashes and belt colours are intentionally
-- retained so existing credentials and historical examination data keep working.
ALTER TABLE students ADD COLUMN admin_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE students ADD COLUMN training_hours_adjustment REAL NOT NULL DEFAULT 0;

-- The sequence is advanced atomically by the API. Initialising it from the
-- largest existing RSK number prevents a deployment from restarting at 0001.
CREATE TABLE IF NOT EXISTS student_id_sequence (
  sequence_name TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL CHECK (last_number >= 0)
);

INSERT OR IGNORE INTO student_id_sequence (sequence_name, last_number)
SELECT
  'student',
  COALESCE(
    MAX(
      CASE
        WHEN UPPER(public_student_id) GLOB 'RSK-[0-9]*'
          AND SUBSTR(UPPER(public_student_id), 5) NOT GLOB '*[^0-9]*'
        THEN CAST(SUBSTR(public_student_id, 5) AS INTEGER)
        ELSE 0
      END
    ),
    0
  )
FROM students;

CREATE INDEX IF NOT EXISTS idx_students_status_updated ON students(active, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_students_dojo ON students(dojo_name COLLATE NOCASE);

