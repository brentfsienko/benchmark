-- Benchmark: full schema + seed (run this once in Supabase SQL Editor)
-- Requires PostGIS enabled: Database → Extensions → PostGIS

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

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_symbol TEXT NOT NULL DEFAULT 'person.crop.circle.fill',
  ADD COLUMN IF NOT EXISTS avatar_photo_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_photo_base64 TEXT NOT NULL DEFAULT '';

INSERT INTO users (id, display_name, username, bio, is_public_profile)
VALUES ('user-1', 'Keith Backdoor', 'keithbackdoor', 'Finding reading spots one bench at a time.', TRUE)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  username = EXCLUDED.username,
  bio = EXCLUDED.bio,
  is_public_profile = EXCLUDED.is_public_profile;

INSERT INTO benches (id, name, neighborhood, bench_type, description, view_score, remoteness_score, popularity_score, average_rating, geom, created_by_user_id)
VALUES
  ('bench-vp-1', 'Volunteer Conservatory Lawn Bench', 'Volunteer Park', 'park', 'Open lawn views near the conservatory with steady afternoon light.', 4.6, 3.7, 4.2, 4.7, ST_SetSRID(ST_MakePoint(-122.3142, 47.6298), 4326)::geography, 'user-1'),
  ('bench-vp-2', 'Water Tower Loop Bench', 'Volunteer Park', 'wooden', 'A quieter seat by the water tower path with skyline peeks.', 4.7, 4.0, 3.8, 4.6, ST_SetSRID(ST_MakePoint(-122.3130, 47.6311), 4326)::geography, 'user-1'),
  ('bench-vp-3', 'Volunteer Amphitheater Edge Bench', 'Volunteer Park', 'stone', 'Easy stop by the amphitheater edge with broad park views.', 4.3, 3.5, 4.0, 4.5, ST_SetSRID(ST_MakePoint(-122.3155, 47.6283), 4326)::geography, 'user-1'),
  ('bench-vp-4', 'Dahlia Garden Pause Bench', 'Volunteer Park', 'park', 'A colorful corner near seasonal blooms, calm in the morning.', 4.5, 3.9, 3.6, 4.4, ST_SetSRID(ST_MakePoint(-122.3163, 47.6304), 4326)::geography, 'user-1'),
  ('bench-vp-5', 'Museum Approach Bench', 'Volunteer Park', 'modern', 'Good people-watching bench along the museum approach path.', 4.2, 3.2, 4.4, 4.3, ST_SetSRID(ST_MakePoint(-122.3128, 47.6290), 4326)::geography, 'user-1')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, neighborhood = EXCLUDED.neighborhood, bench_type = EXCLUDED.bench_type, description = EXCLUDED.description, view_score = EXCLUDED.view_score, remoteness_score = EXCLUDED.remoteness_score, popularity_score = EXCLUDED.popularity_score, average_rating = EXCLUDED.average_rating, geom = EXCLUDED.geom;

DELETE FROM bench_tags WHERE bench_id IN ('bench-vp-1', 'bench-vp-2', 'bench-vp-3', 'bench-vp-4', 'bench-vp-5');
INSERT INTO bench_tags (bench_id, tag)
VALUES ('bench-vp-1', 'volunteer-park'), ('bench-vp-1', 'lawn'), ('bench-vp-1', 'sunny'), ('bench-vp-2', 'quiet'), ('bench-vp-2', 'trees'), ('bench-vp-2', 'loop'), ('bench-vp-3', 'social'), ('bench-vp-3', 'open'), ('bench-vp-3', 'views'), ('bench-vp-4', 'flowers'), ('bench-vp-4', 'morning'), ('bench-vp-4', 'calm'), ('bench-vp-5', 'museum'), ('bench-vp-5', 'people-watching'), ('bench-vp-5', 'path')
ON CONFLICT DO NOTHING;

ALTER TABLE bench_reviews ADD COLUMN IF NOT EXISTS photo_base64_items TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX IF NOT EXISTS bench_reviews_user_created_at_idx ON bench_reviews (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bench_visits_user_visited_at_idx ON bench_visits (user_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS wishlist_items_user_created_at_idx ON wishlist_items (user_id, created_at DESC);

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

CREATE INDEX IF NOT EXISTS challenges_park_id_idx ON challenges (park_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS challenge_participants_points_idx ON challenge_participants (challenge_id, points DESC, updated_at ASC);

INSERT INTO challenges (id, park_id, title, description, starts_at, ends_at, points_per_benchmark, is_active)
VALUES ('challenge-vp-summer-launch', 'volunteer-park', 'summer bench sprint', 'Submit benchmarks at Volunteer Park benches to climb the leaderboard.', NOW() - INTERVAL '1 day', NOW() + INTERVAL '90 day', 10, TRUE)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, points_per_benchmark = EXCLUDED.points_per_benchmark, is_active = EXCLUDED.is_active;

CREATE TABLE IF NOT EXISTS content_reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS content_reports_status_created_idx ON content_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS runtime_feature_flags (
  flag_key TEXT PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO runtime_feature_flags (flag_key, is_enabled) VALUES ('challenge_engine_enabled', TRUE), ('public_leaderboard_enabled', TRUE) ON CONFLICT (flag_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS product_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  bench_id TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS product_events_name_created_idx ON product_events (event_name, created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION list_nearby_benches(p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL, p_radius_meters double precision DEFAULT NULL, p_min_rating double precision DEFAULT NULL, p_min_view_score double precision DEFAULT NULL, p_min_remoteness_score double precision DEFAULT NULL, p_bench_type text DEFAULT NULL)
RETURNS TABLE (id text, name text, neighborhood text, bench_type text, description text, view_score numeric, remoteness_score numeric, popularity_score numeric, average_rating numeric, latitude double precision, longitude double precision, distance_meters double precision)
LANGUAGE sql STABLE AS $$
  SELECT b.id, b.name, b.neighborhood, b.bench_type, b.description, b.view_score, b.remoteness_score, b.popularity_score, b.average_rating,
    ST_Y(b.geom::geometry)::double precision AS latitude, ST_X(b.geom::geometry)::double precision AS longitude,
    CASE WHEN p_lat IS NULL OR p_lng IS NULL THEN 0 ELSE ST_Distance(b.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) END AS distance_meters
  FROM benches b
  WHERE (p_lat IS NULL OR p_lng IS NULL OR p_radius_meters IS NULL OR ST_DWithin(b.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_meters))
    AND (p_min_rating IS NULL OR b.average_rating >= p_min_rating)
    AND (p_min_view_score IS NULL OR b.view_score >= p_min_view_score)
    AND (p_min_remoteness_score IS NULL OR b.remoteness_score >= p_min_remoteness_score)
    AND (p_bench_type IS NULL OR b.bench_type = p_bench_type)
  ORDER BY CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL THEN ST_Distance(b.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) ELSE 0 END ASC,
    (b.average_rating + b.view_score * 0.35 + b.remoteness_score * 0.2 + b.popularity_score * 0.15) DESC, b.created_at DESC
  LIMIT 250;
$$;

CREATE OR REPLACE FUNCTION get_bench_coords(p_id text)
RETURNS TABLE (latitude double precision, longitude double precision)
LANGUAGE sql STABLE AS $$
  SELECT ST_Y(geom::geometry)::double precision AS latitude, ST_X(geom::geometry)::double precision AS longitude FROM benches WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION insert_bench(p_id text, p_name text, p_neighborhood text, p_bench_type text, p_description text, p_view_score numeric, p_remoteness_score numeric, p_popularity_score numeric, p_average_rating numeric, p_lat double precision, p_lng double precision, p_created_by_user_id text, p_tags text[] DEFAULT ARRAY[]::text[])
RETURNS TABLE (id text, name text, neighborhood text, bench_type text, description text, view_score numeric, remoteness_score numeric, popularity_score numeric, average_rating numeric, latitude double precision, longitude double precision, distance_meters double precision)
LANGUAGE plpgsql AS $$
DECLARE v_geom geography;
BEGIN
  v_geom := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  INSERT INTO benches (id, name, neighborhood, bench_type, description, view_score, remoteness_score, popularity_score, average_rating, geom, created_by_user_id)
  VALUES (p_id, p_name, p_neighborhood, p_bench_type, p_description, p_view_score, p_remoteness_score, p_popularity_score, p_average_rating, v_geom, p_created_by_user_id);
  IF array_length(p_tags, 1) > 0 THEN INSERT INTO bench_tags (bench_id, tag) SELECT p_id, unnest(p_tags) ON CONFLICT DO NOTHING; END IF;
  RETURN QUERY SELECT b.id, b.name, b.neighborhood, b.bench_type, b.description, b.view_score, b.remoteness_score, b.popularity_score, b.average_rating, ST_Y(b.geom::geometry)::double precision, ST_X(b.geom::geometry)::double precision, 0::double precision FROM benches b WHERE b.id = p_id;
END;
$$;
