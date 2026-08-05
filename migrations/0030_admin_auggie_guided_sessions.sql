PRAGMA foreign_keys = ON;

-- A guided Admin Auggie conversation keeps only the answers the administrator
-- has given so far, never a chat transcript and never a model reply. The row is
-- bound to one account, one signed-in session and one selected dojo at once, so
-- another administrator can never read or continue someone else's work, and a
-- dojo switch or a sign-out leaves the old row unreachable before the sweeper
-- removes it.
CREATE TABLE IF NOT EXISTS admin_ai_flow_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  selected_dojo_id TEXT NOT NULL REFERENCES dojos(id) ON DELETE CASCADE,
  permission_level TEXT NOT NULL CHECK (permission_level IN ('dojo_admin', 'renshinkan_super_admin')),
  flow_id TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  answer_order_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- One guided conversation at a time for one administrator in one dojo. The
-- reads always name all three columns as well, so the isolation does not rely
-- on the index alone.
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_ai_flow_sessions_owner
  ON admin_ai_flow_sessions(account_id, session_hash, selected_dojo_id);

CREATE INDEX IF NOT EXISTS idx_admin_ai_flow_sessions_expiry
  ON admin_ai_flow_sessions(expires_at);
