-- One-round-trip activity feed for home + profile.
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
  bench_id text,
  bench_name text,
  rating numeric,
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
      r.bench_id,
      COALESCE(b.name, '') AS bench_name,
      r.rating,
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
