-- Seattle Parks import metadata + photo URLs (hotlinked ArcGIS attachments).
-- Additive only — does not alter or delete existing manually created benches.

ALTER TABLE benches
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS global_id text,
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS park_name text,
  ADD COLUMN IF NOT EXISTS site_name text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS material text,
  ADD COLUMN IF NOT EXISTS length_ft numeric,
  ADD COLUMN IF NOT EXISTS year_installed text,
  ADD COLUMN IF NOT EXISTS donor_plaque text,
  ADD COLUMN IF NOT EXISTS program text,
  ADD COLUMN IF NOT EXISTS donor_status text,
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS source_raw jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS benches_source_external_uidx
  ON benches (source_system, external_id)
  WHERE source_system IS NOT NULL AND external_id IS NOT NULL;

-- Idempotent upsert for GIS imports. Preserves non-null length_ft and existing photos.
CREATE OR REPLACE FUNCTION upsert_imported_bench(
  p_id text,
  p_name text,
  p_neighborhood text,
  p_bench_type text,
  p_description text,
  p_lat double precision,
  p_lng double precision,
  p_external_id text,
  p_global_id text,
  p_source_system text,
  p_park_name text,
  p_site_name text,
  p_category text,
  p_material text,
  p_length_ft numeric,
  p_year_installed text,
  p_donor_plaque text,
  p_program text,
  p_donor_status text,
  p_photo_urls text[],
  p_source_raw jsonb,
  p_created_by_user_id text DEFAULT 'user-1',
  p_tags text[] DEFAULT ARRAY['seattle-parks']::text[]
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_geom extensions.geography(POINT, 4326);
  v_existing benches%ROWTYPE;
  v_length numeric;
  v_photos text[];
BEGIN
  IF p_source_system IS NULL OR p_external_id IS NULL THEN
    RAISE EXCEPTION 'source_system and external_id are required';
  END IF;

  v_geom := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography;

  SELECT * INTO v_existing
  FROM benches
  WHERE source_system = p_source_system AND external_id = p_external_id
  LIMIT 1;

  IF FOUND THEN
    v_length := CASE
      WHEN v_existing.length_ft IS NOT NULL THEN v_existing.length_ft
      ELSE p_length_ft
    END;
    v_photos := CASE
      WHEN coalesce(array_length(v_existing.photo_urls, 1), 0) > 0 THEN v_existing.photo_urls
      ELSE coalesce(p_photo_urls, ARRAY[]::text[])
    END;

    UPDATE benches SET
      name = p_name,
      neighborhood = p_neighborhood,
      bench_type = p_bench_type,
      description = p_description,
      geom = v_geom,
      global_id = p_global_id,
      park_name = p_park_name,
      site_name = p_site_name,
      category = p_category,
      material = p_material,
      length_ft = v_length,
      year_installed = p_year_installed,
      donor_plaque = p_donor_plaque,
      program = p_program,
      donor_status = p_donor_status,
      photo_urls = v_photos,
      source_raw = p_source_raw
    WHERE id = v_existing.id;

    RETURN v_existing.id;
  END IF;

  INSERT INTO benches (
    id, name, neighborhood, bench_type, description,
    view_score, remoteness_score, popularity_score, average_rating,
    geom, created_by_user_id,
    external_id, global_id, source_system,
    park_name, site_name, category, material, length_ft,
    year_installed, donor_plaque, program, donor_status,
    photo_urls, source_raw
  ) VALUES (
    p_id, p_name, p_neighborhood, p_bench_type, coalesce(p_description, ''),
    0, 0, 0, 0,
    v_geom, p_created_by_user_id,
    p_external_id, p_global_id, p_source_system,
    p_park_name, p_site_name, p_category, p_material, p_length_ft,
    p_year_installed, p_donor_plaque, p_program, p_donor_status,
    coalesce(p_photo_urls, ARRAY[]::text[]), p_source_raw
  );

  IF p_tags IS NOT NULL THEN
    INSERT INTO bench_tags (bench_id, tag)
    SELECT p_id, t
    FROM unnest(p_tags) AS t
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_imported_bench(
  text, text, text, text, text, double precision, double precision,
  text, text, text, text, text, text, text, numeric, text, text, text, text, text[], jsonb, text, text[]
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_imported_bench(
  text, text, text, text, text, double precision, double precision,
  text, text, text, text, text, text, text, numeric, text, text, text, text, text[], jsonb, text, text[]
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_imported_bench(
  text, text, text, text, text, double precision, double precision,
  text, text, text, text, text, text, text, numeric, text, text, text, text, text[], jsonb, text, text[]
) TO service_role;
