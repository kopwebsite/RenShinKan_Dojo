PRAGMA foreign_keys = ON;

-- Immutable campaign snapshots make historical subscriber delivery independent
-- from later edits to the public website version.
CREATE TABLE IF NOT EXISTS newsletter_deliveries (
  id TEXT PRIMARY KEY,
  newsletter_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'created', 'sent', 'failed_before_send', 'pending_verification')
  ),
  subject TEXT NOT NULL,
  preview_text TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  reply_to TEXT NOT NULL,
  recipient_count INTEGER CHECK (recipient_count IS NULL OR recipient_count >= 0),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  html_content TEXT NOT NULL,
  brevo_campaign_id TEXT,
  error_message TEXT,
  requested_by TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT
);

-- Only one delivery may be in-flight, ambiguous, or completed for a newsletter.
-- A failure known to have happened before sending may be retried deliberately.
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_deliveries_one_active
  ON newsletter_deliveries(newsletter_id)
  WHERE status IN ('pending', 'created', 'sent', 'pending_verification');

CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_newsletter
  ON newsletter_deliveries(newsletter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS newsletter_revisions (
  id TEXT PRIMARY KEY,
  newsletter_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  event_json TEXT NOT NULL CHECK (json_valid(event_json)),
  saved_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(newsletter_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_revisions_recent
  ON newsletter_revisions(newsletter_id, revision DESC);
