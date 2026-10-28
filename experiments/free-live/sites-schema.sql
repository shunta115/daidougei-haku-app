-- Standalone prototype D1 only. Never apply this to Supabase/HAKU.
CREATE TABLE haku_live_lab_state (
  id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL
);
