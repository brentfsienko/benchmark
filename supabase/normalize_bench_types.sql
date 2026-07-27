-- Optional SQL mirror for material-only bench_type.
-- Prefer: npm run import:benches:types (also syncs park/memorial/historic tags).

UPDATE benches
SET bench_type = CASE
  WHEN lower(coalesce(material, '')) LIKE '%composite%' THEN 'composite'
  WHEN lower(coalesce(material, '')) LIKE '%wood%' THEN 'wooden'
  WHEN lower(coalesce(material, '')) ~ '(concrete|stone)' THEN 'concrete'
  WHEN lower(coalesce(material, '')) = 'metal'
    OR lower(coalesce(material, '')) LIKE 'metal%' THEN 'metal'
  WHEN lower(coalesce(category, '')) LIKE '%composite%' THEN 'composite'
  WHEN lower(coalesce(category, '')) LIKE '%wood%' THEN 'wooden'
  WHEN lower(coalesce(category, '')) ~ '(concrete|stone)' THEN 'concrete'
  WHEN lower(coalesce(bench_type, '')) = 'stone' THEN 'concrete'
  WHEN lower(coalesce(bench_type, '')) IN ('wooden', 'metal', 'concrete', 'composite') THEN lower(bench_type)
  WHEN lower(coalesce(bench_type, '')) LIKE '%composite%' THEN 'composite'
  WHEN lower(coalesce(bench_type, '')) LIKE '%wood%' THEN 'wooden'
  WHEN lower(coalesce(bench_type, '')) ~ '(concrete|stone)' THEN 'concrete'
  WHEN lower(coalesce(bench_type, '')) = 'metal'
    OR lower(coalesce(bench_type, '')) LIKE 'metal%' THEN 'metal'
  ELSE 'unknown'
END;
