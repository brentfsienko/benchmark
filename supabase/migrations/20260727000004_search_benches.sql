-- Text benches by name and location fields (neighborhood / park / site).
-- Safe to re-run.

DROP FUNCTION IF EXISTS search_benches(text, integer);

CREATE OR REPLACE FUNCTION search_benches(
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id text,
  name text,
  neighborhood text,
  bench_type text,
  average_rating numeric,
  lat double precision,
  lng double precision,
  review_count bigint,
  tags text[]
)
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    SELECT trim(p_query) AS raw,
           lower(trim(p_query)) AS needle
  )
  SELECT
    b.id,
    b.name,
    b.neighborhood,
    b.bench_type,
    b.average_rating,
    ST_Y(b.geom::geometry)::double precision AS lat,
    ST_X(b.geom::geometry)::double precision AS lng,
    b.review_count::bigint AS review_count,
    COALESCE((
      SELECT array_agg(bt.tag ORDER BY bt.tag)
      FROM bench_tags bt
      WHERE bt.bench_id = b.id
        AND bt.tag IN ('park', 'memorial', 'historic')
    ), ARRAY[]::text[]) AS tags
  FROM benches b, q
  WHERE length(q.needle) >= 2
    AND (
      lower(b.name) LIKE '%' || q.needle || '%'
      OR lower(coalesce(b.neighborhood, '')) LIKE '%' || q.needle || '%'
      OR lower(coalesce(b.park_name, '')) LIKE '%' || q.needle || '%'
      OR lower(coalesce(b.site_name, '')) LIKE '%' || q.needle || '%'
    )
  ORDER BY
    CASE
      WHEN lower(b.name) LIKE q.needle || '%' THEN 0
      WHEN lower(b.name) LIKE '%' || q.needle || '%' THEN 1
      WHEN lower(coalesce(b.park_name, '')) LIKE q.needle || '%' THEN 2
      WHEN lower(coalesce(b.neighborhood, '')) LIKE q.needle || '%' THEN 3
      ELSE 4
    END,
    b.average_rating DESC NULLS LAST,
    b.review_count DESC,
    b.id
  LIMIT LEAST(GREATEST(coalesce(p_limit, 20), 1), 40);
$$;

GRANT EXECUTE ON FUNCTION search_benches(text, integer) TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS benches_name_lower_idx ON benches (lower(name));
CREATE INDEX IF NOT EXISTS benches_neighborhood_lower_idx ON benches (lower(neighborhood));
CREATE INDEX IF NOT EXISTS benches_park_name_lower_idx ON benches (lower(park_name));
