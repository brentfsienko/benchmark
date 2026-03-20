-- Auth linking, followers, Green Lake summer challenge
-- Run in Supabase SQL Editor after 00000_full_schema_and_seed.sql

-- Link users to Supabase auth
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_idx ON users(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- Sync new auth users to our users table
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  v_username TEXT;
  v_display_name TEXT;
  v_id TEXT;
BEGIN
  v_display_name := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));
  v_username := COALESCE(LOWER(TRIM(NEW.raw_user_meta_data->>'username')), 'user_' || substr(NEW.id::text, 1, 8));
  v_id := 'user-' || replace(NEW.id::text, '-', '');
  IF EXISTS (SELECT 1 FROM public.users WHERE username = v_username) THEN
    v_username := v_username || '_' || substr(md5(NEW.id::text), 1, 6);
  END IF;
  INSERT INTO public.users (id, display_name, username, bio, is_public_profile, auth_user_id)
  VALUES (v_id, v_display_name, v_username, '', TRUE, NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Followers / following
CREATE TABLE IF NOT EXISTS user_follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);
CREATE INDEX IF NOT EXISTS user_follows_follower_idx ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS user_follows_following_idx ON user_follows(following_id);

-- Green Lake benches (Seattle - 2.8 mile loop trail)
-- Coordinates approximate around Green Lake Park
INSERT INTO benches (id, name, neighborhood, bench_type, description, view_score, remoteness_score, popularity_score, average_rating, geom, created_by_user_id)
VALUES
  ('bench-gl-1', 'North Beach View Bench', 'Green Lake', 'park', 'Classic lake view from the north shore. Great for sunrise.', 4.8, 3.5, 4.5, 4.6, ST_SetSRID(ST_MakePoint(-122.3280, 47.6820), 4326)::geography, 'user-1'),
  ('bench-gl-2', 'East Green Lake Path Bench', 'Green Lake', 'wooden', 'Shaded spot along the east side loop. Popular with runners.', 4.2, 3.0, 4.8, 4.4, ST_SetSRID(ST_MakePoint(-122.3240, 47.6800), 4326)::geography, 'user-1'),
  ('bench-gl-3', 'South Duck Pond Bench', 'Green Lake', 'park', 'Near the duck pond. Kids and waterfowl watching.', 4.0, 2.8, 4.6, 4.3, ST_SetSRID(ST_MakePoint(-122.3300, 47.6770), 4326)::geography, 'user-1'),
  ('bench-gl-4', 'West Side Sunset Bench', 'Green Lake', 'wooden', 'Best sunset views over the water. Bring a blanket.', 4.9, 3.8, 4.2, 4.7, ST_SetSRID(ST_MakePoint(-122.3340, 47.6795), 4326)::geography, 'user-1'),
  ('bench-gl-5', 'Community Center Lawn Bench', 'Green Lake', 'park', 'By the community center. People-watching central.', 4.1, 2.5, 4.9, 4.2, ST_SetSRID(ST_MakePoint(-122.3260, 47.6810), 4326)::geography, 'user-1'),
  ('bench-gl-6', 'Bathhouse Theater Bench', 'Green Lake', 'stone', 'Quiet corner near the bathhouse theater. Morning readers.', 4.4, 4.0, 3.8, 4.5, ST_SetSRID(ST_MakePoint(-122.3320, 47.6785), 4326)::geography, 'user-1'),
  ('bench-gl-7', 'Woodland Park Connector Bench', 'Green Lake', 'wooden', 'Where Green Lake meets Woodland Park. Shady and cool.', 4.3, 4.2, 3.5, 4.4, ST_SetSRID(ST_MakePoint(-122.3360, 47.6780), 4326)::geography, 'user-1'),
  ('bench-gl-8', 'Stone Way Approach Bench', 'Green Lake', 'modern', 'Modern bench near Stone Way. Good for a quick pause.', 4.0, 3.2, 4.4, 4.2, ST_SetSRID(ST_MakePoint(-122.3220, 47.6805), 4326)::geography, 'user-1')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, neighborhood = EXCLUDED.neighborhood, bench_type = EXCLUDED.bench_type,
  description = EXCLUDED.description, view_score = EXCLUDED.view_score, remoteness_score = EXCLUDED.remoteness_score,
  popularity_score = EXCLUDED.popularity_score, average_rating = EXCLUDED.average_rating, geom = EXCLUDED.geom;

INSERT INTO bench_tags (bench_id, tag)
VALUES
  ('bench-gl-1', 'green-lake'), ('bench-gl-1', 'sunrise'), ('bench-gl-1', 'lake-view'),
  ('bench-gl-2', 'green-lake'), ('bench-gl-2', 'shade'), ('bench-gl-2', 'loop'),
  ('bench-gl-3', 'green-lake'), ('bench-gl-3', 'ducks'), ('bench-gl-3', 'family'),
  ('bench-gl-4', 'green-lake'), ('bench-gl-4', 'sunset'), ('bench-gl-4', 'views'),
  ('bench-gl-5', 'green-lake'), ('bench-gl-5', 'community-center'), ('bench-gl-5', 'people-watching'),
  ('bench-gl-6', 'green-lake'), ('bench-gl-6', 'quiet'), ('bench-gl-6', 'reading'),
  ('bench-gl-7', 'green-lake'), ('bench-gl-7', 'woodland-park'), ('bench-gl-7', 'shade'),
  ('bench-gl-8', 'green-lake'), ('bench-gl-8', 'modern'), ('bench-gl-8', 'quick-stop')
ON CONFLICT DO NOTHING;

-- Green Lake Summer Challenge
INSERT INTO challenges (id, park_id, title, description, starts_at, ends_at, points_per_benchmark, is_active)
VALUES (
  'challenge-gl-summer-2025',
  'green-lake',
  'Green Lake Summer Bench Tour',
  'Visit and submit benchmarks at all 8 benches around Green Lake this summer. Complete the loop and climb the leaderboard!',
  '2025-06-21 00:00:00+00',
  '2025-09-22 23:59:59+00',
  15,
  TRUE
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
  points_per_benchmark = EXCLUDED.points_per_benchmark, is_active = EXCLUDED.is_active;
