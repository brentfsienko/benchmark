# Seattle park bench importer

Pipeline to load Seattle Parks GIS benches into Supabase.

## Prerequisites

1. Place the CSV at `scripts/bench-importer/data/seattle-park-bench.csv`
2. Add to `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (Dashboard → Project Settings → API)
3. Run the schema SQL in the Supabase SQL editor:
   - `supabase/seattle_bench_import_fields.sql`

## Commands

```bash
npm run import:benches:parse    # CSV → output/benches-seattle.json
npm run import:benches:photos   # fetch ArcGIS attachment URLs (~1 min)
npm run import:benches          # upsert into Supabase
npm run import:benches -- --limit=50   # smoke test
```

Upsert is idempotent on `(source_system, external_id)`. It never overwrites a non-null `length_ft` or existing `photo_urls` with empty values.
