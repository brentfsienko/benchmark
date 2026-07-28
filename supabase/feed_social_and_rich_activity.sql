-- Social engagement on benchmarks + richer activity feed payloads.
-- Safe to re-run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS review_likes (
  review_id TEXT NOT NULL REFERENCES bench_reviews(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (review_id, user_id)
);

CREATE INDEX IF NOT EXISTS review_likes_user_idx ON review_likes (user_id);
CREATE INDEX IF NOT EXISTS review_likes_review_idx ON review_likes (review_id);

CREATE TABLE IF NOT EXISTS review_comments (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES bench_reviews(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_comments_review_created_idx
  ON review_comments (review_id, created_at ASC);

DROP FUNCTION IF EXISTS list_activity_feed(text, boolean, integer, timestamptz);

CREATE OR REPLACE FUNCTION list_activity_feed(
  p_user_id text,
  p_feed boolean DEFAULT false,
  p_limit integer DEFAULT 20,
  p_before timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id text,
  user_id text,
  author text,
  username text,
  avatar_photo_url text,
  bench_id text,
  bench_name text,
  neighborhood text,
  latitude double precision,
  longitude double precision,
  rating numeric,
  body text,
  photo_base64_items text[],
  like_count integer,
  comment_count integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  WITH feed_users AS (
    SELECT p_user_id AS uid
    WHERE NOT p_feed
    UNION ALL
    SELECT p_user_id AS uid
    WHERE p_feed
    UNION ALL
    SELECT uf.following_id AS uid
    FROM user_follows uf
    WHERE p_feed
      AND uf.follower_id = p_user_id
  ),
  ranked AS (
    SELECT
      r.id,
      r.user_id,
      COALESCE(NULLIF(u.display_name, ''), NULLIF(u.username, ''), '') AS author,
      COALESCE(u.username, '') AS username,
      COALESCE(u.avatar_photo_url, '') AS avatar_photo_url,
      r.bench_id,
      COALESCE(b.name, '') AS bench_name,
      COALESCE(b.neighborhood, '') AS neighborhood,
      ST_Y(b.geom::geometry) AS latitude,
      ST_X(b.geom::geometry) AS longitude,
      r.rating,
      COALESCE(r.body, '') AS body,
      COALESCE(r.photo_base64_items, ARRAY[]::text[]) AS photo_base64_items,
      (SELECT COUNT(*)::integer FROM review_likes rl WHERE rl.review_id = r.id) AS like_count,
      (SELECT COUNT(*)::integer FROM review_comments rc WHERE rc.review_id = r.id) AS comment_count,
      r.created_at
    FROM bench_reviews r
    INNER JOIN feed_users fu ON fu.uid = r.user_id
    LEFT JOIN users u ON u.id = r.user_id
    LEFT JOIN benches b ON b.id = r.bench_id
    WHERE p_before IS NULL OR r.created_at < p_before
    ORDER BY r.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  )
  SELECT * FROM ranked;
$$;

GRANT EXECUTE ON FUNCTION list_activity_feed(text, boolean, integer, timestamptz)
  TO anon, authenticated, service_role;
