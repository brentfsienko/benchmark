-- Admin bench pin movement support + case-insensitive username uniqueness

-- Enforce case-insensitive uniqueness in addition to existing UNIQUE(username)
-- If legacy case-collisions exist, skip index creation instead of failing migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'users_username_lower_unique_idx'
  ) THEN
    IF EXISTS (
      SELECT lower(username)
      FROM users
      GROUP BY lower(username)
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE 'Skipping users_username_lower_unique_idx due to existing case-collisions';
    ELSE
      EXECUTE 'CREATE UNIQUE INDEX users_username_lower_unique_idx ON public.users ((lower(username)))';
    END IF;
  END IF;
END $$;

-- RPC used by admin move-pin action in explore map
CREATE OR REPLACE FUNCTION update_bench_coords(
  p_id text,
  p_lat double precision,
  p_lng double precision
)
RETURNS void AS $$
BEGIN
  UPDATE benches
  SET geom = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
