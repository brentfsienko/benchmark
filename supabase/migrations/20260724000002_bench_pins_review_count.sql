-- Include benchmark (review) counts on map pin payloads for carousel previews.
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
    (
      SELECT COUNT(*)::bigint
      FROM bench_reviews br
      WHERE br.bench_id = b.id
    ) AS review_count
  FROM benches b
  WHERE b.geom && ST_MakeEnvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326)
    AND (p_min_rating IS NULL OR b.average_rating >= p_min_rating)
  LIMIT 500;
$$;
