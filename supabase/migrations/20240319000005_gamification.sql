CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  park_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  points_per_benchmark INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS challenge_participants (
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  progress_count INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS challenges_park_id_idx
  ON challenges (park_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS challenge_participants_points_idx
  ON challenge_participants (challenge_id, points DESC, updated_at ASC);

INSERT INTO challenges (
  id, park_id, title, description, starts_at, ends_at, points_per_benchmark, is_active
)
VALUES (
  'challenge-vp-summer-launch',
  'volunteer-park',
  'summer bench sprint',
  'Submit benchmarks at Volunteer Park benches to climb the leaderboard.',
  NOW() - INTERVAL '1 day',
  NOW() + INTERVAL '90 day',
  10,
  TRUE
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at,
  points_per_benchmark = EXCLUDED.points_per_benchmark,
  is_active = EXCLUDED.is_active;
