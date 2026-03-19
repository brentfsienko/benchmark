INSERT INTO users (id, display_name, username, bio, is_public_profile)
VALUES ('user-1', 'Keith Backdoor', 'keithbackdoor', 'Finding reading spots one bench at a time.', TRUE)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  username = EXCLUDED.username,
  bio = EXCLUDED.bio,
  is_public_profile = EXCLUDED.is_public_profile;

INSERT INTO benches (
  id,
  name,
  neighborhood,
  bench_type,
  description,
  view_score,
  remoteness_score,
  popularity_score,
  average_rating,
  geom,
  created_by_user_id
)
VALUES
  (
    'bench-vp-1',
    'Volunteer Conservatory Lawn Bench',
    'Volunteer Park',
    'park',
    'Open lawn views near the conservatory with steady afternoon light.',
    4.6,
    3.7,
    4.2,
    4.7,
    ST_SetSRID(ST_MakePoint(-122.3142, 47.6298), 4326)::geography,
    'user-1'
  ),
  (
    'bench-vp-2',
    'Water Tower Loop Bench',
    'Volunteer Park',
    'wooden',
    'A quieter seat by the water tower path with skyline peeks.',
    4.7,
    4.0,
    3.8,
    4.6,
    ST_SetSRID(ST_MakePoint(-122.3130, 47.6311), 4326)::geography,
    'user-1'
  ),
  (
    'bench-vp-3',
    'Volunteer Amphitheater Edge Bench',
    'Volunteer Park',
    'stone',
    'Easy stop by the amphitheater edge with broad park views.',
    4.3,
    3.5,
    4.0,
    4.5,
    ST_SetSRID(ST_MakePoint(-122.3155, 47.6283), 4326)::geography,
    'user-1'
  ),
  (
    'bench-vp-4',
    'Dahlia Garden Pause Bench',
    'Volunteer Park',
    'park',
    'A colorful corner near seasonal blooms, calm in the morning.',
    4.5,
    3.9,
    3.6,
    4.4,
    ST_SetSRID(ST_MakePoint(-122.3163, 47.6304), 4326)::geography,
    'user-1'
  ),
  (
    'bench-vp-5',
    'Museum Approach Bench',
    'Volunteer Park',
    'modern',
    'Good people-watching bench along the museum approach path.',
    4.2,
    3.2,
    4.4,
    4.3,
    ST_SetSRID(ST_MakePoint(-122.3128, 47.6290), 4326)::geography,
    'user-1'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  neighborhood = EXCLUDED.neighborhood,
  bench_type = EXCLUDED.bench_type,
  description = EXCLUDED.description,
  view_score = EXCLUDED.view_score,
  remoteness_score = EXCLUDED.remoteness_score,
  popularity_score = EXCLUDED.popularity_score,
  average_rating = EXCLUDED.average_rating,
  geom = EXCLUDED.geom;

DELETE FROM bench_tags
WHERE bench_id IN ('bench-vp-1', 'bench-vp-2', 'bench-vp-3', 'bench-vp-4', 'bench-vp-5');

INSERT INTO bench_tags (bench_id, tag)
VALUES
  ('bench-vp-1', 'volunteer-park'),
  ('bench-vp-1', 'lawn'),
  ('bench-vp-1', 'sunny'),
  ('bench-vp-2', 'quiet'),
  ('bench-vp-2', 'trees'),
  ('bench-vp-2', 'loop'),
  ('bench-vp-3', 'social'),
  ('bench-vp-3', 'open'),
  ('bench-vp-3', 'views'),
  ('bench-vp-4', 'flowers'),
  ('bench-vp-4', 'morning'),
  ('bench-vp-4', 'calm'),
  ('bench-vp-5', 'museum'),
  ('bench-vp-5', 'people-watching'),
  ('bench-vp-5', 'path')
ON CONFLICT DO NOTHING;
