-- Faster pin listing: JOIN for review counts + lower LIMIT for map payloads.
DROP FUNCTION IF EXISTS list_bench_pins(double precision, double precision, double precision, double precision, double precision);

CREATE OR REPLACE FUNCTION list_bench_pins(
  p_sw_lat double precision,
  p_sw_lng double precision,
  p_ne_lat double precision,
  p_ne_lng double precision,
  p_min_rating double precision DEFAULT NULL
)
RETURNS TABLE (
  id text,
  name text,
  neighborhood text,
  bench_type text,
  average_rating numeric,
  lat double precision,
  lng double precision,
  review_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    b.id,
    b.name,
    b.neighborhood,
    b.bench_type,
    b.average_rating,
    ST_Y(b.geom::geometry)::double precision AS lat,
    ST_X(b.geom::geometry)::double precision AS lng,
    COALESCE(rc.review_count, 0)::bigint AS review_count
  FROM benches b
  LEFT JOIN (
    SELECT bench_id, COUNT(*)::bigint AS review_count
    FROM bench_reviews
    GROUP BY bench_id
  ) rc ON rc.bench_id = b.id
  WHERE b.geom && ST_MakeEnvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326)
    AND (p_min_rating IS NULL OR b.average_rating >= p_min_rating)
  -- Prefer densest-rated seats when the viewport is packed (Seattle parks).
  ORDER BY b.average_rating DESC NULLS LAST, b.id
  LIMIT 180;
$$;
