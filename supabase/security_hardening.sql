-- Security hardening for Benchmark (run in Supabase SQL editor).
-- Service-role API continues to work (bypasses RLS). Anon/authenticated
-- PostgREST access is denied by enabling RLS with no permissive policies.

-- ─── Enable RLS on all user/app tables ─────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users',
    'benches',
    'bench_tags',
    'bench_visits',
    'bench_reviews',
    'wishlist_items',
    'challenges',
    'challenge_participants',
    'content_reports',
    'runtime_feature_flags',
    'product_events',
    'user_follows',
    'follow_requests'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- Optional read-only public benches for direct clients (safe catalog data).
-- App still uses service role; this only matters if something uses the anon key.
DROP POLICY IF EXISTS "public read benches" ON public.benches;
CREATE POLICY "public read benches"
  ON public.benches FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public read bench_tags" ON public.bench_tags;
CREATE POLICY "public read bench_tags"
  ON public.bench_tags FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public read challenges" ON public.challenges;
CREATE POLICY "public read challenges"
  ON public.challenges FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── Lock down write RPCs (callable only via service_role / postgres) ──────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_bench_coords'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.update_bench_coords(text, double precision, double precision) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.update_bench_coords(text, double precision, double precision) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.update_bench_coords(text, double precision, double precision) FROM authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'insert_bench'
  ) THEN
    -- insert_bench has a long signature; revoke from PUBLIC broadly via name search
    EXECUTE (
      SELECT string_agg(
        format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', oid::regprocedure),
        '; '
      )
      FROM pg_proc
      WHERE proname = 'insert_bench'
        AND pronamespace = 'public'::regnamespace
    );
  END IF;
END $$;

-- Keep read RPCs available for map pins if the client ever calls them directly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'list_nearby_benches'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    EXECUTE (
      SELECT string_agg(
        format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', oid::regprocedure),
        '; '
      )
      FROM pg_proc
      WHERE proname IN ('list_nearby_benches', 'list_bench_pins', 'get_bench_coords')
        AND pronamespace = 'public'::regnamespace
    );
  END IF;
END $$;
