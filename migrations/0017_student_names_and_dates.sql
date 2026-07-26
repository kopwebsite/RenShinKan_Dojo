PRAGMA foreign_keys = ON;

-- Keep the existing display_name column as the canonical English lookup name
-- while storing the optional Thai name and the two dates administrators need
-- to maintain independently.
ALTER TABLE students ADD COLUMN english_name TEXT;
ALTER TABLE students ADD COLUMN thai_name TEXT;
ALTER TABLE students ADD COLUMN account_created_date TEXT;
ALTER TABLE students ADD COLUMN dojo_joined_date TEXT;

UPDATE students
SET english_name = COALESCE(NULLIF(english_name, ''), display_name),
    account_created_date = COALESCE(NULLIF(account_created_date, ''), substr(created_at, 1, 10)),
    dojo_joined_date = COALESCE(
      NULLIF(dojo_joined_date, ''),
      (
        SELECT substr(h.changed_at, 1, 10)
        FROM student_dojo_history h
        WHERE h.student_id = students.id
        ORDER BY h.changed_at ASC
        LIMIT 1
      ),
      substr(created_at, 1, 10)
    );

CREATE INDEX IF NOT EXISTS idx_students_english_name
  ON students(english_name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_students_thai_name
  ON students(thai_name COLLATE NOCASE)
  WHERE thai_name IS NOT NULL AND thai_name <> '';
