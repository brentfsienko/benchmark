-- Slim bounding-box function for map pins (returns only fields the map needs)
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
  lng double precision
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
    ST_X(b.geom::geometry)::double precision AS lng
  FROM benches b
  WHERE b.geom && ST_MakeEnvelope(p_sw_lng, p_sw_lat, p_ne_lng, p_ne_lat, 4326)
    AND (p_min_rating IS NULL OR b.average_rating >= p_min_rating)
  LIMIT 500;
$$;

-- Drop old signature first because return type changed (added tags column)
DROP FUNCTION IF EXISTS list_nearby_benches(double precision, double precision, double precision, double precision, double precision, double precision, text);

CREATE OR REPLACE FUNCTION list_nearby_benches(
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_radius_meters double precision DEFAULT NULL,
  p_min_rating double precision DEFAULT NULL,
  p_min_view_score double precision DEFAULT NULL,
  p_min_remoteness_score double precision DEFAULT NULL,
  p_bench_type text DEFAULT NULL
)
RETURNS TABLE (
  id text,
  name text,
  neighborhood text,
  bench_type text,
  description text,
  view_score numeric,
  remoteness_score numeric,
  popularity_score numeric,
  average_rating numeric,
  latitude double precision,
  longitude double precision,
  distance_meters double precision,
  tags text[]
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    b.id,
    b.name,
    b.neighborhood,
    b.bench_type,
    b.description,
    b.view_score,
    b.remoteness_score,
    b.popularity_score,
    b.average_rating,
    ST_Y(b.geom::geometry)::double precision AS latitude,
    ST_X(b.geom::geometry)::double precision AS longitude,
    CASE
      WHEN p_lat IS NULL OR p_lng IS NULL THEN 0
      ELSE ST_Distance(
        b.geom,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      )
    END AS distance_meters,
    COALESCE(
      (SELECT array_agg(bt.tag) FROM bench_tags bt WHERE bt.bench_id = b.id),
      ARRAY[]::text[]
    ) AS tags
  FROM benches b
  WHERE (
    p_lat IS NULL OR p_lng IS NULL OR p_radius_meters IS NULL OR
    ST_DWithin(
      b.geom,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_meters
    )
  )
  AND (p_min_rating IS NULL OR b.average_rating >= p_min_rating)
  AND (p_min_view_score IS NULL OR b.view_score >= p_min_view_score)
  AND (p_min_remoteness_score IS NULL OR b.remoteness_score >= p_min_remoteness_score)
  AND (p_bench_type IS NULL OR b.bench_type = p_bench_type)
  ORDER BY
    CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
      ST_Distance(b.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)
    ELSE 0 END ASC,
    (b.average_rating + b.view_score * 0.35 + b.remoteness_score * 0.2 + b.popularity_score * 0.15) DESC,
    b.created_at DESC
  LIMIT 250;
$$;
