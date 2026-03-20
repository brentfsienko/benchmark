-- Reposition Green Lake challenge benches to confirmed on-land path points
-- This migration updates existing rows directly by bench id.

UPDATE benches
SET geom = CASE id
  WHEN 'bench-gl-1' THEN ST_SetSRID(ST_MakePoint(-122.3360, 47.6833), 4326)::geography
  WHEN 'bench-gl-2' THEN ST_SetSRID(ST_MakePoint(-122.3314, 47.6849), 4326)::geography
  WHEN 'bench-gl-3' THEN ST_SetSRID(ST_MakePoint(-122.3245, 47.6838), 4326)::geography
  WHEN 'bench-gl-4' THEN ST_SetSRID(ST_MakePoint(-122.3210, 47.6809), 4326)::geography
  WHEN 'bench-gl-5' THEN ST_SetSRID(ST_MakePoint(-122.3224, 47.6771), 4326)::geography
  WHEN 'bench-gl-6' THEN ST_SetSRID(ST_MakePoint(-122.3277, 47.6754), 4326)::geography
  WHEN 'bench-gl-7' THEN ST_SetSRID(ST_MakePoint(-122.3344, 47.6766), 4326)::geography
  WHEN 'bench-gl-8' THEN ST_SetSRID(ST_MakePoint(-122.3374, 47.6795), 4326)::geography
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
