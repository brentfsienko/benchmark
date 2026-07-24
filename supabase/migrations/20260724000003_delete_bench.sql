-- Atomic admin bench deletion (children cascade via FKs; explicit deletes for safety).
CREATE OR REPLACE FUNCTION delete_bench(p_id text)
RETURNS TABLE (
  id text,
  name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT b.name INTO v_name FROM benches b WHERE b.id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bench not found: %', p_id USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM bench_reviews WHERE bench_id = p_id;
  DELETE FROM bench_visits WHERE bench_id = p_id;
  DELETE FROM wishlist_items WHERE bench_id = p_id;
  DELETE FROM bench_tags WHERE bench_id = p_id;
  DELETE FROM benches WHERE benches.id = p_id;

  id := p_id;
  name := v_name;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_bench(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_bench(text) FROM anon;
REVOKE ALL ON FUNCTION public.delete_bench(text) FROM authenticated;
