-- Reposition Green Lake challenge benches to confirmed on-land path points
-- This migration updates existing rows directly by bench id.

UPDATE benches
SET geom = CASE id
  WHEN 'bench-gl-1' THEN ST_SetSRID(ST_MakePoint(-122.3308, 47.6846), 4326)::geography
  WHEN 'bench-gl-2' THEN ST_SetSRID(ST_MakePoint(-122.3200, 47.6808), 4326)::geography
  WHEN 'bench-gl-3' THEN ST_SetSRID(ST_MakePoint(-122.3276, 47.6750), 4326)::geography
  WHEN 'bench-gl-4' THEN ST_SetSRID(ST_MakePoint(-122.3379, 47.6798), 4326)::geography
  WHEN 'bench-gl-5' THEN ST_SetSRID(ST_MakePoint(-122.3235, 47.6838), 4326)::geography
  WHEN 'bench-gl-6' THEN ST_SetSRID(ST_MakePoint(-122.3344, 47.6842), 4326)::geography
  WHEN 'bench-gl-7' THEN ST_SetSRID(ST_MakePoint(-122.3363, 47.6766), 4326)::geography
  WHEN 'bench-gl-8' THEN ST_SetSRID(ST_MakePoint(-122.3195, 47.6823), 4326)::geography
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
