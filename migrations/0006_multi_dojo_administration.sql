PRAGMA foreign_keys = ON;

-- Additive multi-dojo administration migration. Existing student identifiers,
-- examination history, contributions, lookup capabilities, and public URLs are
-- intentionally preserved.
CREATE TABLE IF NOT EXISTS dojos (
  id TEXT PRIMARY KEY,
  official_name TEXT NOT NULL UNIQUE,
  short_name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  logo_url TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  contact_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(contact_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO dojos
  (id, official_name, short_name, code, logo_url, slug, active, sort_order, created_at, updated_at)
VALUES
  ('dojo-ai', 'Ai Dojo', 'Ai Dojo', 'AI', '/dojos/ai-dojo.jpg', 'ai-dojo', 1, 10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('dojo-cmu', 'Chiang Mai University Aikido Club', 'CMU Aikido Club', 'CMU', '/dojos/chiang-mai-university-aikido-club.jpg', 'chiang-mai-university-aikido-club', 1, 20, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('dojo-rsk', 'RenShinKan Dojo', 'RenShinKan', 'RSK', '/renshinkan-logo.png', 'renshinkan-dojo', 1, 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('dojo-nu', 'Naresuan University Aikido Club', 'Naresuan University', 'NU', '/dojos/naresuan-university-aikido-club.jpg', 'naresuan-university-aikido-club', 1, 40, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('dojo-all-gym', 'All Gym Chiang Mai', 'All Gym', 'AG', '/dojos/all-gym-chiang-mai.jpg', 'all-gym-chiang-mai', 1, 50, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('dojo-mhs', 'Aikido Mae Hong Son', 'Mae Hong Son', 'MHS', '/dojos/aikido-mae-hong-son.jpg', 'aikido-mae-hong-son', 1, 60, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

ALTER TABLE students ADD COLUMN dojo_id TEXT REFERENCES dojos(id) ON DELETE RESTRICT;
ALTER TABLE students ADD COLUMN aat_number TEXT;
ALTER TABLE students ADD COLUMN aat_last_paid_date TEXT;
ALTER TABLE students ADD COLUMN aat_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE students ADD COLUMN deleted_at TEXT;
ALTER TABLE students ADD COLUMN deleted_by TEXT;

UPDATE students
SET dojo_id = CASE
  WHEN lower(trim(dojo_name)) IN ('ai dojo', 'ai') THEN 'dojo-ai'
  WHEN lower(trim(dojo_name)) IN ('chiang mai university aikido club', 'cmu', 'cmu aikido club') THEN 'dojo-cmu'
  WHEN lower(trim(dojo_name)) IN ('naresuan university aikido club', 'naresuan university', 'nu') THEN 'dojo-nu'
  WHEN lower(trim(dojo_name)) IN ('all gym chiang mai', 'all gym', 'allgym') THEN 'dojo-all-gym'
  WHEN lower(trim(dojo_name)) IN ('aikido mae hong son', 'mae hong son', 'mhs') THEN 'dojo-mhs'
  ELSE 'dojo-rsk'
END
WHERE dojo_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_students_dojo_status
  ON students(dojo_id, active, profile_status, deleted_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_students_aat_number
  ON students(aat_number COLLATE NOCASE) WHERE aat_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_students_aat_paid
  ON students(dojo_id, aat_last_paid_date);

CREATE TABLE IF NOT EXISTS dojo_student_sequences (
  dojo_id TEXT PRIMARY KEY REFERENCES dojos(id) ON DELETE RESTRICT,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO dojo_student_sequences (dojo_id, last_number, updated_at)
SELECT d.id,
  COALESCE(MAX(
    CASE
      WHEN upper(s.public_student_id) GLOB upper(d.code) || '-[0-9]*'
        AND substr(upper(s.public_student_id), length(d.code) + 2) NOT GLOB '*[^0-9]*'
      THEN CAST(substr(s.public_student_id, length(d.code) + 2) AS INTEGER)
      ELSE 0
    END
  ), 0),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM dojos d
LEFT JOIN students s ON s.dojo_id = d.id
GROUP BY d.id;

CREATE TABLE IF NOT EXISTS student_dojo_history (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  previous_dojo_id TEXT REFERENCES dojos(id) ON DELETE RESTRICT,
  new_dojo_id TEXT NOT NULL REFERENCES dojos(id) ON DELETE RESTRICT,
  changed_by TEXT NOT NULL,
  reason TEXT,
  changed_at TEXT NOT NULL
);

INSERT OR IGNORE INTO student_dojo_history
  (id, student_id, previous_dojo_id, new_dojo_id, changed_by, reason, changed_at)
SELECT 'initial:' || id, id, NULL, dojo_id, 'migration', 'Initial dojo mapping from the legacy dojo name', created_at
FROM students WHERE dojo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_dojo_history_student
  ON student_dojo_history(student_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS aat_membership_payments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  dojo_id TEXT NOT NULL REFERENCES dojos(id) ON DELETE RESTRICT,
  payment_date TEXT NOT NULL,
  renewal_due_date TEXT NOT NULL,
  amount REAL CHECK (amount IS NULL OR amount >= 0),
  currency TEXT NOT NULL DEFAULT 'THB',
  notes TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL,
  recorded_by_role TEXT NOT NULL CHECK (recorded_by_role IN ('central', 'dojo')),
  recorded_by_dojo_id TEXT REFERENCES dojos(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO aat_membership_payments
  (id, student_id, dojo_id, payment_date, renewal_due_date, notes, recorded_by, recorded_by_role, recorded_by_dojo_id, created_at)
SELECT 'legacy:' || id, id, dojo_id, aat_last_paid_date,
  date(aat_last_paid_date, '+1 year'), 'Imported from the legacy latest-payment field',
  'migration', 'central', 'dojo-rsk', updated_at
FROM students WHERE aat_last_paid_date IS NOT NULL AND dojo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_aat_payments_student_date
  ON aat_membership_payments(student_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_aat_payments_dojo_date
  ON aat_membership_payments(dojo_id, payment_date DESC);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  dojo_id TEXT NOT NULL REFERENCES dojos(id) ON DELETE RESTRICT,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('aat_annual', 'renshinkan_monthly', 'exam', 'other')),
  amount REAL CHECK (amount IS NULL OR amount >= 0),
  currency TEXT NOT NULL DEFAULT 'THB',
  payment_date TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment', 'paid', 'cancelled', 'refunded')),
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_history (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_student_type
  ON payments(student_id, payment_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_dojo_status
  ON payments(dojo_id, status, created_at DESC);

ALTER TABLE examination_cycles ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE examination_cycles ADD COLUMN examination_type TEXT NOT NULL DEFAULT 'Belt promotion';
ALTER TABLE examination_cycles ADD COLUMN rank_category TEXT NOT NULL DEFAULT 'Kyu and Dan';
ALTER TABLE examination_cycles ADD COLUMN application_opens_at TEXT;
ALTER TABLE examination_cycles ADD COLUMN application_closes_at TEXT;
ALTER TABLE examination_cycles ADD COLUMN examination_at TEXT;
ALTER TABLE examination_cycles ADD COLUMN venue TEXT NOT NULL DEFAULT '';
ALTER TABLE examination_cycles ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'open'
  CHECK (lifecycle_status IN ('draft', 'open', 'closed', 'completed', 'archived'));
ALTER TABLE examination_cycles ADD COLUMN instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE examination_cycles ADD COLUMN rank_fee_config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(rank_fee_config_json));
ALTER TABLE examination_cycles ADD COLUMN annual_fee_config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(annual_fee_config_json));
ALTER TABLE examination_cycles ADD COLUMN created_by TEXT NOT NULL DEFAULT 'legacy_admin';
ALTER TABLE examination_cycles ADD COLUMN updated_at TEXT;

UPDATE examination_cycles
SET title = COALESCE(NULLIF(title, ''), name),
    lifecycle_status = CASE WHEN status = 'active' THEN 'open' ELSE 'closed' END,
    updated_at = COALESCE(updated_at, created_at)
WHERE title = '' OR updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_examination_cycles_single_active
  ON examination_cycles(status) WHERE status = 'active';

ALTER TABLE examination_applications ADD COLUMN dojo_id TEXT REFERENCES dojos(id) ON DELETE RESTRICT;
ALTER TABLE examination_applications ADD COLUMN last_examination_date TEXT;
ALTER TABLE examination_applications ADD COLUMN practice_period TEXT NOT NULL DEFAULT '';
ALTER TABLE examination_applications ADD COLUMN grade_given TEXT NOT NULL DEFAULT '';
ALTER TABLE examination_applications ADD COLUMN exam_fee REAL NOT NULL DEFAULT 0 CHECK (exam_fee >= 0);
ALTER TABLE examination_applications ADD COLUMN aat_annual_fee REAL NOT NULL DEFAULT 0 CHECK (aat_annual_fee >= 0);
ALTER TABLE examination_applications ADD COLUMN other_fees REAL NOT NULL DEFAULT 0 CHECK (other_fees >= 0);
ALTER TABLE examination_applications ADD COLUMN total_fee REAL NOT NULL DEFAULT 0 CHECK (total_fee >= 0);
ALTER TABLE examination_applications ADD COLUMN application_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE examination_applications ADD COLUMN approved_at TEXT;
ALTER TABLE examination_applications ADD COLUMN approved_by TEXT;

UPDATE examination_applications
SET dojo_id = (SELECT dojo_id FROM students WHERE students.id = examination_applications.student_id)
WHERE dojo_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_exam_app_dojo_cycle
  ON examination_applications(dojo_id, cycle_id, status, submitted_at DESC);

ALTER TABLE audit_log ADD COLUMN administrator_name TEXT;
ALTER TABLE audit_log ADD COLUMN administrator_role TEXT;
ALTER TABLE audit_log ADD COLUMN selected_dojo_id TEXT REFERENCES dojos(id) ON DELETE RESTRICT;
ALTER TABLE audit_log ADD COLUMN ip_address TEXT;
ALTER TABLE audit_log ADD COLUMN country_code TEXT;
ALTER TABLE audit_log ADD COLUMN user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_dojo_created
  ON audit_log(selected_dojo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_admin_created
  ON audit_log(administrator_name COLLATE NOCASE, created_at DESC);

CREATE TABLE IF NOT EXISTS site_content_drafts (
  id TEXT PRIMARY KEY CHECK (id = 'current'),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_revisions (
  id TEXT PRIMARY KEY,
  revision_number INTEGER NOT NULL UNIQUE,
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  published_by TEXT NOT NULL,
  published_at TEXT NOT NULL,
  source_revision_id TEXT REFERENCES site_revisions(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_site_revisions_published
  ON site_revisions(published_at DESC);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  width INTEGER,
  height INTEGER,
  alt_text TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
