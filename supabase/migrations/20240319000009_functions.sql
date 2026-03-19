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
  distance_meters double precision
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
    END AS distance_meters
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

CREATE OR REPLACE FUNCTION get_bench_coords(p_id text)
RETURNS TABLE (latitude double precision, longitude double precision)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ST_Y(geom::geometry)::double precision AS latitude,
    ST_X(geom::geometry)::double precision AS longitude
  FROM benches
  WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION insert_bench(
  p_id text,
  p_name text,
  p_neighborhood text,
  p_bench_type text,
  p_description text,
  p_view_score numeric,
  p_remoteness_score numeric,
  p_popularity_score numeric,
  p_average_rating numeric,
  p_lat double precision,
  p_lng double precision,
  p_created_by_user_id text,
  p_tags text[] DEFAULT ARRAY[]::text[]
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
  distance_meters double precision
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_geom geography;
BEGIN
  v_geom := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  INSERT INTO benches (id, name, neighborhood, bench_type, description, view_score, remoteness_score, popularity_score, average_rating, geom, created_by_user_id)
  VALUES (p_id, p_name, p_neighborhood, p_bench_type, p_description, p_view_score, p_remoteness_score, p_popularity_score, p_average_rating, v_geom, p_created_by_user_id);

  IF array_length(p_tags, 1) > 0 THEN
    INSERT INTO bench_tags (bench_id, tag)
    SELECT p_id, unnest(p_tags)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY
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
    ST_Y(b.geom::geometry)::double precision,
    ST_X(b.geom::geometry)::double precision,
    0::double precision
  FROM benches b
  WHERE b.id = p_id;
END;
$$;
