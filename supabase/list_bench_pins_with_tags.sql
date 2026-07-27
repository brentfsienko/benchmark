-- Add facet tags (park / memorial / historic) to list_bench_pins payloads.
-- Run after global_scale_bench_pins.sql. Safe to re-run.

DROP FUNCTION IF EXISTS list_bench_pins(double precision, double precision, double precision, double precision, double precision);
DROP FUNCTION IF EXISTS list_bench_pins(double precision, double precision, double precision, double precision, double precision, double precision);
DROP FUNCTION IF EXISTS list_bench_pins(double precision, double precision, double precision, double precision, double precision, double precision, integer);

CREATE OR REPLACE FUNCTION list_bench_pins(
  p_sw_lat double precision,
  p_sw_lng double precision,
  p_ne_lat double precision,
  p_ne_lng double precision,
  p_min_rating double precision DEFAULT NULL,
  p_zoom double precision DEFAULT NULL,
  p_limit integer DEFAULT NULL
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
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_sw_lat double precision := LEAST(p_sw_lat, p_ne_lat);
  v_ne_lat double precision := GREATEST(p_sw_lat, p_ne_lat);
  v_sw_lng double precision := p_sw_lng;
  v_ne_lng double precision := p_ne_lng;
  v_crosses_antimeridian boolean := p_sw_lng > p_ne_lng;
  v_lat_span double precision;
  v_lng_span double precision;
  v_limit integer;
  v_grid_cols integer;
  v_grid_rows integer;
BEGIN
  v_lat_span := GREATEST(v_ne_lat - v_sw_lat, 0.0001);
  IF v_crosses_antimeridian THEN
    v_lng_span := GREATEST((180.0 - v_sw_lng) + (v_ne_lng + 180.0), 0.0001);
  ELSE
    v_lng_span := GREATEST(v_ne_lng - v_sw_lng, 0.0001);
  END IF;

  IF p_limit IS NOT NULL AND p_limit > 0 THEN
    v_limit := LEAST(p_limit, 400);
  ELSIF p_zoom IS NOT NULL AND p_zoom >= 15 THEN
    v_limit := 280;
  ELSIF p_zoom IS NOT NULL AND p_zoom >= 13 THEN
    v_limit := 220;
  ELSIF GREATEST(v_lat_span, v_lng_span) <= 0.03 THEN
    v_limit := 280;
  ELSIF GREATEST(v_lat_span, v_lng_span) <= 0.12 THEN
    v_limit := 200;
  ELSIF GREATEST(v_lat_span, v_lng_span) <= 0.5 THEN
    v_limit := 140;
  ELSIF GREATEST(v_lat_span, v_lng_span) <= 2.0 THEN
    v_limit := 100;
  ELSE
    v_limit := 72;
  END IF;

  IF GREATEST(v_lat_span, v_lng_span) <= 0.08 THEN
    RETURN QUERY
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
    FROM benches b
    WHERE
      ST_Y(b.geom::geometry) BETWEEN v_sw_lat AND v_ne_lat
      AND (
        CASE
          WHEN v_crosses_antimeridian THEN
            ST_X(b.geom::geometry) >= v_sw_lng OR ST_X(b.geom::geometry) <= v_ne_lng
          ELSE
            ST_X(b.geom::geometry) BETWEEN v_sw_lng AND v_ne_lng
        END
      )
      AND (p_min_rating IS NULL OR b.average_rating >= p_min_rating)
      AND (
        CASE
          WHEN v_crosses_antimeridian THEN
            b.geom && ST_MakeEnvelope(v_sw_lng, v_sw_lat, 180, v_ne_lat, 4326)
            OR b.geom && ST_MakeEnvelope(-180, v_sw_lat, v_ne_lng, v_ne_lat, 4326)
          ELSE
            b.geom && ST_MakeEnvelope(v_sw_lng, v_sw_lat, v_ne_lng, v_ne_lat, 4326)
        END
      )
    ORDER BY b.average_rating DESC NULLS LAST, b.review_count DESC, b.id
    LIMIT v_limit;
    RETURN;
  END IF;

  v_grid_cols := GREATEST(6, LEAST(24, CEIL(SQRT(v_limit * (v_lng_span / v_lat_span)))::integer));
  v_grid_rows := GREATEST(6, LEAST(24, CEIL(SQRT(v_limit * (v_lat_span / v_lng_span)))::integer));

  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.neighborhood,
    s.bench_type,
    s.average_rating,
    s.lat,
    s.lng,
    s.review_count,
    s.tags
  FROM (
    SELECT DISTINCT ON (gx, gy)
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
      ), ARRAY[]::text[]) AS tags,
      WIDTH_BUCKET(ST_Y(b.geom::geometry), v_sw_lat, v_ne_lat + 1e-9, v_grid_rows) AS gy,
      CASE
        WHEN v_crosses_antimeridian THEN
          WIDTH_BUCKET(
            CASE
              WHEN ST_X(b.geom::geometry) >= v_sw_lng THEN ST_X(b.geom::geometry)
              ELSE ST_X(b.geom::geometry) + 360.0
            END,
            v_sw_lng,
            v_sw_lng + v_lng_span + 1e-9,
            v_grid_cols
          )
        ELSE
          WIDTH_BUCKET(ST_X(b.geom::geometry), v_sw_lng, v_ne_lng + 1e-9, v_grid_cols)
      END AS gx
    FROM benches b
    WHERE
      ST_Y(b.geom::geometry) BETWEEN v_sw_lat AND v_ne_lat
      AND (
        CASE
          WHEN v_crosses_antimeridian THEN
            ST_X(b.geom::geometry) >= v_sw_lng OR ST_X(b.geom::geometry) <= v_ne_lng
          ELSE
            ST_X(b.geom::geometry) BETWEEN v_sw_lng AND v_ne_lng
        END
      )
      AND (p_min_rating IS NULL OR b.average_rating >= p_min_rating)
      AND (
        CASE
          WHEN v_crosses_antimeridian THEN
            b.geom && ST_MakeEnvelope(v_sw_lng, v_sw_lat, 180, v_ne_lat, 4326)
            OR b.geom && ST_MakeEnvelope(-180, v_sw_lat, v_ne_lng, v_ne_lat, 4326)
          ELSE
            b.geom && ST_MakeEnvelope(v_sw_lng, v_sw_lat, v_ne_lng, v_ne_lat, 4326)
        END
      )
    ORDER BY
      gx,
      gy,
      b.average_rating DESC NULLS LAST,
      b.review_count DESC,
      b.id
  ) s
  ORDER BY s.average_rating DESC NULLS LAST, s.review_count DESC, s.id
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION list_bench_pins(
  double precision, double precision, double precision, double precision,
  double precision, double precision, integer
) TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS bench_tags_tag_idx ON bench_tags (tag);
