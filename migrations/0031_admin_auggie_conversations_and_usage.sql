PRAGMA foreign_keys = ON;

-- Short-lived conversational context is deliberately separate from business
-- data and from the mutation ledger. It is bound to one account, signed-in
-- session and selected dojo, and is removed on reset, sign-out or expiry.
CREATE TABLE IF NOT EXISTS admin_ai_conversation_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  selected_dojo_id TEXT NOT NULL REFERENCES dojos(id) ON DELETE CASCADE,
  permission_level TEXT NOT NULL CHECK (permission_level IN ('dojo_admin', 'renshinkan_super_admin')),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'th')),
  current_path TEXT NOT NULL,
  summary_text TEXT NOT NULL DEFAULT '',
  messages_json TEXT NOT NULL DEFAULT '[]',
  context_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_ai_conversation_owner
  ON admin_ai_conversation_sessions(account_id, session_hash, selected_dojo_id);
CREATE INDEX IF NOT EXISTS idx_admin_ai_conversation_expiry
  ON admin_ai_conversation_sessions(expires_at);

-- This is an application budget ledger, not a representation of a Cloudflare
-- account quota. Token values come from the Workers AI response usage object.
CREATE TABLE IF NOT EXISTS admin_ai_daily_usage (
  usage_date TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('application', 'admin', 'dojo')),
  scope_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  calls INTEGER NOT NULL DEFAULT 0 CHECK (calls >= 0),
  unreported_calls INTEGER NOT NULL DEFAULT 0 CHECK (unreported_calls >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (usage_date, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_ai_daily_usage_scope
  ON admin_ai_daily_usage(scope_type, scope_id, usage_date DESC);
