PRAGMA foreign_keys = ON;

-- Student-entered AAT dates are claims awaiting administrator verification.
-- The existing aat_last_paid_date remains the confirmed operational date.
ALTER TABLE students ADD COLUMN aat_self_reported_paid_date TEXT;
ALTER TABLE students ADD COLUMN aat_membership_verification_status TEXT NOT NULL DEFAULT 'not_reported'
  CHECK (aat_membership_verification_status IN ('not_reported', 'self_reported', 'confirmed'));

UPDATE students
SET aat_membership_verification_status = 'confirmed'
WHERE aat_last_paid_date IS NOT NULL AND aat_last_paid_date <> '';

CREATE INDEX IF NOT EXISTS idx_students_aat_verification
  ON students(dojo_id, aat_membership_verification_status, updated_at DESC);

-- Training-hour requests preserve when and where the training occurred.
-- Quarter-hour integers are canonical for new records; existing REAL values remain readable.
ALTER TABLE training_hour_requests ADD COLUMN training_date TEXT;
ALTER TABLE training_hour_requests ADD COLUMN source_type TEXT
  CHECK (source_type IS NULL OR source_type IN ('renshinkan', 'aat', 'other'));
ALTER TABLE training_hour_requests ADD COLUMN organization TEXT;
ALTER TABLE training_hour_requests ADD COLUMN source_details TEXT;
ALTER TABLE training_hour_requests ADD COLUMN student_notes TEXT;
ALTER TABLE training_hour_requests ADD COLUMN hours_quarters INTEGER
  CHECK (hours_quarters IS NULL OR (hours_quarters > 0 AND hours_quarters <= 4000));

UPDATE training_hour_requests
SET hours_quarters = CAST(ROUND(submitted_hours * 4) AS INTEGER)
WHERE hours_quarters IS NULL;

ALTER TABLE training_hours ADD COLUMN source_type TEXT
  CHECK (source_type IS NULL OR source_type IN ('renshinkan', 'aat', 'other'));
ALTER TABLE training_hours ADD COLUMN organization TEXT;
ALTER TABLE training_hours ADD COLUMN source_details TEXT;
ALTER TABLE training_hours ADD COLUMN notes TEXT;
ALTER TABLE training_hours ADD COLUMN hours_quarters INTEGER
  CHECK (hours_quarters IS NULL OR hours_quarters >= 0);

UPDATE training_hours
SET hours_quarters = CAST(ROUND(verified_hours * 4) AS INTEGER)
WHERE hours_quarters IS NULL;

CREATE INDEX IF NOT EXISTS idx_training_hour_requests_student_date
  ON training_hour_requests(student_id, training_date DESC, submitted_at DESC, id);

-- New examination applications snapshot an integer THB amount at submission.
ALTER TABLE examination_applications ADD COLUMN fee_snapshot_thb INTEGER
  CHECK (fee_snapshot_thb IS NULL OR fee_snapshot_thb >= 0);
ALTER TABLE examination_applications ADD COLUMN fee_currency TEXT NOT NULL DEFAULT 'THB'
  CHECK (fee_currency = 'THB');

UPDATE examination_applications
SET fee_snapshot_thb = CAST(ROUND(COALESCE(total_fee, 0)) AS INTEGER)
WHERE fee_snapshot_thb IS NULL;

-- A payment request is one auditable header with one or more student line items.
CREATE TABLE IF NOT EXISTS payment_requests (
  id TEXT PRIMARY KEY,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('aat_annual', 'renshinkan_monthly')),
  dojo_id TEXT REFERENCES dojos(id) ON DELETE RESTRICT,
  total_amount_thb INTEGER NOT NULL CHECK (total_amount_thb >= 0),
  currency TEXT NOT NULL DEFAULT 'THB' CHECK (currency = 'THB'),
  status TEXT NOT NULL DEFAULT 'awaiting_upload'
    CHECK (status IN ('awaiting_upload', 'pending_review', 'approved', 'denied', 'cancelled')),
  submitted_by_ip_hash TEXT,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(request_id)
);

CREATE TABLE IF NOT EXISTS payment_request_items (
  id TEXT PRIMARY KEY,
  payment_request_id TEXT NOT NULL REFERENCES payment_requests(id) ON DELETE RESTRICT,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  dojo_id TEXT NOT NULL REFERENCES dojos(id) ON DELETE RESTRICT,
  payment_reference_id TEXT NOT NULL,
  period_key TEXT,
  amount_thb INTEGER NOT NULL CHECK (amount_thb >= 0),
  status TEXT NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment', 'pending_review', 'paid', 'denied', 'cancelled', 'refunded')),
  last_verified_date TEXT,
  next_due_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(payment_request_id, student_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_status
  ON payment_requests(status, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_payment_request_items_student
  ON payment_request_items(student_id, status, created_at DESC, id);

-- D1 stores only object keys and metadata; image bytes remain in R2.
CREATE TABLE IF NOT EXISTS student_profile_media (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type = 'image/webp'),
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 2097152),
  width INTEGER NOT NULL CHECK (width BETWEEN 256 AND 4096),
  height INTEGER NOT NULL CHECK (height BETWEEN 256 AND 4096),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replaced', 'removed')),
  created_at TEXT NOT NULL,
  removed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_profile_media_active
  ON student_profile_media(student_id)
  WHERE status = 'active';

-- Published downloads may reference an immutable static asset or an R2 object key.
CREATE TABLE IF NOT EXISTS download_assets (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL,
  title_th TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  description_th TEXT NOT NULL DEFAULT '',
  language_label TEXT NOT NULL DEFAULT 'English / Thai',
  file_kind TEXT NOT NULL DEFAULT 'PDF' CHECK (file_kind = 'PDF'),
  static_path TEXT,
  object_key TEXT,
  file_size INTEGER CHECK (file_size IS NULL OR file_size > 0),
  page_count INTEGER CHECK (page_count IS NULL OR page_count > 0),
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system',
  CHECK ((static_path IS NOT NULL AND object_key IS NULL) OR (static_path IS NULL AND object_key IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_download_assets_public
  ON download_assets(published, sort_order, updated_at DESC, id);

INSERT OR IGNORE INTO download_assets (
  id, slug, title_en, title_th, description_en, description_th,
  language_label, static_path, file_size, page_count, published, sort_order,
  updated_at, updated_by
) VALUES
  (
    'download-aat-membership-2026',
    'aat-membership-application-en-th-2026',
    'AAT Membership Application',
    'ใบสมัครสมาชิกสมาคมไอคิโดประเทศไทย',
    'Bilingual annual membership application for the Aikido Association of Thailand.',
    'ใบสมัครสมาชิกประจำปีแบบสองภาษาสำหรับสมาคมไอคิโดประเทศไทย',
    'English / ไทย',
    '/downloads/aat-membership-application-en-th-2026.pdf',
    109898,
    1,
    1,
    10,
    '2026-07-27T00:00:00.000Z',
    'system'
  ),
  (
    'download-aikido-grading-2026',
    'aikido-grading-requirements-en-th-2026',
    'Aikido Grading Requirements',
    'ข้อกำหนดการสอบระดับไอคิโด',
    'Bilingual grading requirements from 10th Kyu through Shodan-Ho.',
    'ข้อกำหนดการสอบระดับแบบสองภาษาตั้งแต่คิว 10 ถึงโชดันโฮ',
    'English / ไทย',
    '/downloads/aikido-grading-requirements-en-th-2026.pdf',
    486623,
    11,
    1,
    20,
    '2026-07-27T00:00:00.000Z',
    'system'
  );
