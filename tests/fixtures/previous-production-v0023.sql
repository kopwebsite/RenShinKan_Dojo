-- Sanitized, deterministic data shaped like the release immediately before
-- migrations 0024, 0025, and 0026. It contains no production identifiers or people.
PRAGMA foreign_keys = ON;

INSERT INTO students (
  id, public_student_id, lookup_code_hash, name_verification_hash,
  display_name, english_name, thai_name, current_belt, belt_color,
  profile_image_url, profile_image_consent, public_visible, active,
  dojo_name, dojo_id, created_at, updated_at, account_created_date,
  dojo_joined_date, profile_status
) VALUES
  ('fixture-student-rsk', 'TST-260001', 'fixture-lookup-rsk', 'fixture-name-rsk',
   'Sanitized Student One', 'Sanitized Student One', 'ผู้เรียนทดสอบหนึ่ง',
   '6th Kyu', 'white', '/uploads/student-profiles/2026/07/00000000-0000-4000-8000-000000000001.webp',
   1, 1, 1, 'RenShinKan Dojo', 'dojo-rsk',
   '2024-01-15T08:00:00.000Z', '2026-07-30T08:00:00.000Z', '2024-01-15', '2024-02-01', 'approved'),
  ('fixture-student-ai', 'TST-260002', 'fixture-lookup-ai', 'fixture-name-ai',
   'Sanitized Student Two', 'Sanitized Student Two', NULL,
   '5th Kyu', 'yellow', NULL, 0, 1, 1, 'Ai Dojo', 'dojo-ai',
   '2023-06-10T08:00:00.000Z', '2026-07-29T08:00:00.000Z', '2023-06-10', NULL, 'approved');

INSERT INTO training_hours
  (id, student_id, entry_date, verified_hours, source, created_at)
VALUES
  ('fixture-hours-1', 'fixture-student-rsk', '2026-06-30', 24, 'fixture', '2026-06-30T08:00:00.000Z');

INSERT INTO belt_examinations
  (id, student_id, examination_date, belt_awarded, belt_color, rank, examiner, public_notes, created_at)
VALUES
  ('fixture-exam-1', 'fixture-student-rsk', '2025-12-14', '6th Kyu', 'white', '6th Kyu',
   'Sanitized Examiner', 'Sanitized fixture record', '2025-12-14T08:00:00.000Z');

INSERT INTO payments
  (id, student_id, dojo_id, payment_type, amount, currency, payment_date, status,
   reference, notes, recorded_by, created_at, updated_at)
VALUES
  ('fixture-payment-1', 'fixture-student-rsk', 'dojo-rsk', 'aat_annual', 1200, 'THB',
   '2026-01-12', 'paid', 'fixture-reference', 'Sanitized fixture payment',
   'fixture-admin', '2026-01-12T08:00:00.000Z', '2026-01-12T08:00:00.000Z');

INSERT INTO payment_proofs (
  id, student_id, dojo_id, payment_type, payment_reference_id,
  upload_token_hash, object_key, original_filename, content_type, file_size,
  status, submitted_at, reviewed_at, reviewed_by, created_at, updated_at
) VALUES (
  'fixture-proof-1', 'fixture-student-rsk', 'dojo-rsk', 'aat_annual',
  'fixture-payment-1', 'fixture-upload-token', 'payment-proofs/fixture-proof-1.webp',
  'sanitized-proof.webp', 'image/webp', 2048, 'approved',
  '2026-01-12T08:01:00.000Z', '2026-01-12T08:02:00.000Z', 'fixture-admin',
  '2026-01-12T08:00:00.000Z', '2026-01-12T08:02:00.000Z'
);

INSERT INTO media_assets
  (id, storage_key, public_url, mime_type, byte_size, width, height, alt_text, uploaded_by, created_at)
VALUES
  ('fixture-media-1', 'admin/2026/07/fixture-gallery.webp',
   '/uploads/admin/2026/07/fixture-gallery.webp', 'image/webp', 4096, 800, 600,
   'Sanitized aikido practice fixture', 'fixture-admin', '2026-07-01T08:00:00.000Z');

INSERT INTO student_profile_media
  (id, student_id, object_key, content_type, file_size, width, height, status, created_at)
VALUES
  ('fixture-profile-media-1', 'fixture-student-rsk',
   'student-profiles/2026/07/00000000-0000-4000-8000-000000000001.webp',
   'image/webp', 3072, 512, 512, 'active', '2026-07-01T08:00:00.000Z');

INSERT INTO newsletter_revisions
  (id, newsletter_id, revision, event_json, saved_by, created_at)
VALUES
  ('fixture-newsletter-revision-1', 'fixture-newsletter-1', 1,
   '{"id":"fixture-newsletter-1","title":"Sanitized release fixture"}',
   'fixture-admin', '2026-07-15T08:00:00.000Z');

INSERT INTO site_revisions
  (id, revision_number, content_json, published_by, published_at, note)
VALUES
  ('fixture-site-revision-1', 900001, '{"version":3}', 'fixture-admin',
   '2026-07-15T08:00:00.000Z', 'Sanitized previous-release fixture');

INSERT INTO share_tokens
  (id, token_hash, student_id, active, expires_at, created_at, purpose)
VALUES
  ('fixture-share-1', 'fixture-share-token-hash', 'fixture-student-rsk', 1,
   '2027-01-01T00:00:00.000Z', '2026-07-01T08:00:00.000Z', 'owner');

INSERT INTO student_access_sessions
  (id, token_hash, student_id, expires_at, request_id, created_at)
VALUES
  ('fixture-student-session-1', 'fixture-student-session-token', 'fixture-student-rsk',
   '2026-08-15T00:00:00.000Z', 'fixture-request-student-session', '2026-07-31T08:00:00.000Z');

INSERT INTO admin_login_attempts
  (actor_hash, window_started_at, attempts, locked_until)
VALUES
  ('fixture-admin-actor', '2026-07-31T08:00:00.000Z', 2, NULL);

INSERT INTO revoked_admin_sessions
  (session_id, expires_at, revoked_at, revoked_by, reason)
VALUES
  ('fixture-revoked-session', '2026-09-01T00:00:00.000Z',
   '2026-07-31T08:00:00.000Z', 'fixture-admin', 'fixture revocation');

INSERT INTO audit_log
  (id, admin_action, record_type, record_id, action_summary, created_at,
   actor_type, actor_identifier, action, entity_type, entity_id, student_id,
   request_id, student_public_id_snapshot, student_name_snapshot,
   administrator_name, administrator_role, selected_dojo_id, outcome)
VALUES
  ('fixture-audit-1', 'student_updated', 'student', 'fixture-student-rsk',
   'Sanitized previous-release audit record', '2026-07-31T08:00:00.000Z',
   'administrator', 'fixture-admin-account', 'student_updated', 'student',
   'fixture-student-rsk', 'fixture-student-rsk', 'fixture-request-audit',
   'TST-260001', 'Sanitized Student One', 'Fixture Administrator',
   'renshinkan_super_admin', 'dojo-rsk', 'success');
