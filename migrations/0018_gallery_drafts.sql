PRAGMA foreign_keys = ON;

-- Gallery albums are stored in the published KV content document. This
-- additive table keeps the administrator's reviewable draft separate from the
-- public document and from unrelated website-editor drafts.
CREATE TABLE IF NOT EXISTS gallery_drafts (
  id TEXT PRIMARY KEY CHECK (id = 'current'),
  albums_json TEXT NOT NULL CHECK (json_valid(albums_json)),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
