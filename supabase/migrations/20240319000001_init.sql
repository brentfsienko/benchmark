CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  is_public_profile BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS benches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  bench_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  view_score NUMERIC(2,1) NOT NULL DEFAULT 0,
  remoteness_score NUMERIC(2,1) NOT NULL DEFAULT 0,
  popularity_score NUMERIC(2,1) NOT NULL DEFAULT 0,
  average_rating NUMERIC(2,1) NOT NULL DEFAULT 0,
  geom GEOGRAPHY(POINT, 4326) NOT NULL,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bench_tags (
  bench_id TEXT NOT NULL REFERENCES benches(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (bench_id, tag)
);

CREATE TABLE IF NOT EXISTS bench_visits (
  id TEXT PRIMARY KEY,
  bench_id TEXT NOT NULL REFERENCES benches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bench_reviews (
  id TEXT PRIMARY KEY,
  bench_id TEXT NOT NULL REFERENCES benches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating NUMERIC(2,1) NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bench_id TEXT NOT NULL REFERENCES benches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, bench_id)
);

CREATE INDEX IF NOT EXISTS benches_geom_idx ON benches USING GIST (geom);
CREATE INDEX IF NOT EXISTS bench_visits_bench_id_idx ON bench_visits (bench_id);
CREATE INDEX IF NOT EXISTS bench_reviews_bench_id_idx ON bench_reviews (bench_id);
