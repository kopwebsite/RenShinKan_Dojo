PRAGMA foreign_keys = ON;

-- Student IDs remain stable lookup credentials. When an administrator fixes
-- an ID, the old value continues to resolve to the same record through this
-- alias table. No student or workflow history is rewritten or deleted.
CREATE TABLE IF NOT EXISTS student_id_aliases (
  alias_public_student_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'administrator_correction',
  PRIMARY KEY (alias_public_student_id)
);

CREATE INDEX IF NOT EXISTS idx_student_id_aliases_student
  ON student_id_aliases(student_id, created_at DESC);

-- These two tables contain only retired challenge credentials and lockout
-- state. Student, administrator, audit, and workflow records remain intact.
DROP INDEX IF EXISTS idx_student_private_access_active;
DROP TABLE IF EXISTS student_private_access;
DROP INDEX IF EXISTS idx_admin_rsk_verification_lockout;
DROP TABLE IF EXISTS admin_rsk_verification_attempts;

UPDATE students SET lookup_code_hash = '' WHERE lookup_code_hash <> '';

INSERT OR REPLACE INTO schema_deprecations
  (object_name, deprecated_at, replacement, note)
VALUES
  (
    'student_private_access',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    'Student name plus current or aliased Student ID',
    'Retired credential table removed; student records and workflow history are preserved.'
  ),
  (
    'admin_rsk_verification_attempts',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    'Primary administrator authentication and dojo-scoped authorization',
    'Secondary RenShinKan password and its transient lockout state were retired.'
  );
