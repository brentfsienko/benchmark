CREATE TABLE IF NOT EXISTS content_reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_reports_status_created_idx
  ON content_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS runtime_feature_flags (
  flag_key TEXT PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO runtime_feature_flags (flag_key, is_enabled)
VALUES
  ('challenge_engine_enabled', TRUE),
  ('public_leaderboard_enabled', TRUE)
ON CONFLICT (flag_key) DO NOTHING;
