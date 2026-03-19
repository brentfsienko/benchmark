ALTER TABLE bench_reviews
  ADD COLUMN IF NOT EXISTS photo_base64_items TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS bench_reviews_user_created_at_idx
  ON bench_reviews (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bench_visits_user_visited_at_idx
  ON bench_visits (user_id, visited_at DESC);

CREATE INDEX IF NOT EXISTS wishlist_items_user_created_at_idx
  ON wishlist_items (user_id, created_at DESC);
