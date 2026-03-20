-- Reposition Green Lake challenge benches to confirmed on-land path points
-- This migration updates existing rows directly by bench id.

UPDATE benches
SET geom = CASE id
  WHEN 'bench-gl-1' THEN ST_SetSRID(ST_MakePoint(-122.3352, 47.6843), 4326)::geography
  WHEN 'bench-gl-2' THEN ST_SetSRID(ST_MakePoint(-122.3237, 47.6842), 4326)::geography
  WHEN 'bench-gl-3' THEN ST_SetSRID(ST_MakePoint(-122.3191, 47.6806), 4326)::geography
  WHEN 'bench-gl-4' THEN ST_SetSRID(ST_MakePoint(-122.3216, 47.6766), 4326)::geography
  WHEN 'bench-gl-5' THEN ST_SetSRID(ST_MakePoint(-122.3289, 47.6750), 4326)::geography
  WHEN 'bench-gl-6' THEN ST_SetSRID(ST_MakePoint(-122.3354, 47.6763), 4326)::geography
  WHEN 'bench-gl-7' THEN ST_SetSRID(ST_MakePoint(-122.3382, 47.6802), 4326)::geography
  WHEN 'bench-gl-8' THEN ST_SetSRID(ST_MakePoint(-122.3367, 47.6829), 4326)::geography
  ELSE geom
END
WHERE id IN (
  'bench-gl-1',
  'bench-gl-2',
  'bench-gl-3',
  'bench-gl-4',
  'bench-gl-5',
  'bench-gl-6',
  'bench-gl-7',
  'bench-gl-8'
);
