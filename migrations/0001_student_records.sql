PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  public_student_id TEXT NOT NULL UNIQUE,
  lookup_code_hash TEXT NOT NULL,
  name_verification_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  current_belt TEXT NOT NULL,
  belt_color TEXT NOT NULL,
  profile_image_url TEXT,
  profile_image_consent INTEGER NOT NULL DEFAULT 0 CHECK (profile_image_consent IN (0, 1)),
  guardian_consent INTEGER NOT NULL DEFAULT 0 CHECK (guardian_consent IN (0, 1)),
  public_visible INTEGER NOT NULL DEFAULT 1 CHECK (public_visible IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  share_fields TEXT NOT NULL DEFAULT '{"photo":false,"trainingHours":true,"examinations":true,"lastUpdated":true}',
  dojo_name TEXT NOT NULL DEFAULT 'RenShinKan Dojo',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_students_lookup ON students(name_verification_hash, lookup_code_hash, active, public_visible);
CREATE INDEX IF NOT EXISTS idx_students_name ON students(display_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_students_belt ON students(current_belt);

CREATE TABLE IF NOT EXISTS belt_examinations (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  examination_date TEXT NOT NULL,
  belt_awarded TEXT NOT NULL,
  belt_color TEXT NOT NULL,
  rank TEXT,
  examiner TEXT,
  public_notes TEXT,
  internal_notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_examinations_student_date ON belt_examinations(student_id, examination_date DESC);

CREATE TABLE IF NOT EXISTS training_hours (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  entry_date TEXT NOT NULL,
  period_end TEXT,
  verified_hours REAL NOT NULL CHECK (verified_hours > 0 AND verified_hours <= 1000),
  source TEXT,
  internal_note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_training_hours_student_date ON training_hours(student_id, entry_date DESC);

CREATE TABLE IF NOT EXISTS share_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  expires_at TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_student ON share_tokens(student_id, active);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  admin_action TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action_summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS lookup_attempts (
  actor_hash TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  attempts INTEGER NOT NULL
);
