-- Follow requests (consent-based following)
CREATE TABLE IF NOT EXISTS follow_requests (
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (requester_id, target_id),
  CHECK (requester_id <> target_id)
);

CREATE INDEX IF NOT EXISTS follow_requests_target_status_idx
  ON follow_requests (target_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS follow_requests_requester_status_idx
  ON follow_requests (requester_id, status, created_at DESC);
