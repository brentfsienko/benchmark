# Benchmark

App for finding park benches, rating them, and sharing sits with friends. Live at [benchmark.rest](https://benchmark.rest).

## Overview

Benchmark is a social map of places to sit. You explore benches on a map, drop a **benchmark** (a rating, note, and photos of the view), follow other sitters, and pick up challenges like visiting every bench in a park.

The product is aimed at phones first: a persistent bottom nav, an explore map with clustered pins, and a sheet for bench details and submissions. Accounts are optional for browsing the catalog; signing in unlocks submitting, following, wishlists, and the activity feed.

Typical loop:

1. Open **explore**, pan the map, tap a pin.
2. Read ratings and photos, or submit your own sit.
3. Follow friends, watch the **home** feed, and chase **challenges**.
4. If an area has no benches yet, request coverage from the map overlay.

Stack in one sentence: **Next.js (App Router) on Vercel, talking to its own `/api/v1` routes, which talk to Supabase (Postgres + PostGIS + Auth).** Map tiles come from MapTiler; transactional email goes through Resend.

## Architecture

One Next.js app on Vercel — no separate backend. Pages in `app/` and components in `src/` call `src/lib/api.ts`, which hits `/api/v1` route handlers. Those talk to Supabase (Postgres + PostGIS + Auth). The map is Leaflet + MapTiler; auth email goes through Resend.

Main surfaces: `/explore` (map), `/home` (feed), `/bench/[id]`, `/challenges`, `/profile`, `/ops`.

## Run locally

Needs **Node 20+**, npm, and a Supabase project with PostGIS enabled.

1. Clone and install:

   ```bash
   git clone git@github.com:brentfsienko/benchmark.git
   cd benchmark
   npm install
   ```

2. Copy env and fill in secrets:

   ```bash
   cp .env.example .env.local
   ```

   Minimum to load benches:

   | Variable | Where |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Same page, **service_role** (secret) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page, **anon** / publishable key |

   For a working map, add `NEXT_PUBLIC_MAPTILER_KEY` from [maptiler.com](https://cloud.maptiler.com/account/keys/). Restrict the key to `localhost` and `benchmark.rest`.

   Auth, email, and production URLs are documented in [SETUP.md](./SETUP.md) and [DEPLOYMENT.md](./DEPLOYMENT.md). `.env.example` lists the full set.

3. Schema: in the Supabase SQL editor, run `supabase/migrations/00000_full_schema_and_seed.sql` (or apply later migrations if the project is already provisioned).

4. Start the app:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3001](http://localhost:3001) (port **3001**, not 3000).

5. Before a PR:

   ```bash
   npm run quality:ci    # lint, types, unit tests
   npm run test:e2e      # Playwright smoke (optional, slower)
   ```

### Deploy

Production is Vercel, wired to GitHub. Merging a PR to `main` deploys. Env vars and Auth redirect URLs are in [DEPLOYMENT.md](./DEPLOYMENT.md). Direct pushes to `main` often skip the preview pipeline — use a PR.

## Contribute

1. Branch from up-to-date `main`. Keep the change small and named for the work (`fix/…`, `feat/…`, `docs/…`).
2. Don’t commit `.env.local`, keys, or photos dumps. `.env.example` is the template.
3. Match existing style: lowercase copy in the UI, typed API helpers in `src/lib/api.ts`, route handlers under `app/api/v1`.
4. Run `npm run quality:ci`. Add or extend tests when you change geo, auth, or API behavior (`src/lib/*.test.ts`, `tests/e2e`).
5. Open a **pull request** against `main`. Include a short summary and a test plan (what to click on explore, a bench sheet, auth, etc.).
6. Wait for Vercel preview + CI. Don’t merge your own map/tile or env-sensitive changes until the preview map actually loads.

Questions about schema or importers: `scripts/bench-importer/README.md` and `supabase/migrations/`.

## Adding benches

Bench records come from city GIS exports and OSM data. The import pipeline has two stages: a city-specific **parse** script that converts raw data into a common JSON format, followed by a shared **upsert** script that pushes records to Supabase.

### Seattle

Source: City of Seattle / King County GIS CSV (included in `scripts/bench-importer/data/`).

```bash
npm run import:benches:parse
npm run import:benches -- --file=./scripts/bench-importer/output/benches-seattle.json --limit=50
npm run import:benches -- --file=./scripts/bench-importer/output/benches-seattle.json
```

### San Francisco

Source: OpenStreetMap export (3,367 benches, all geometry types). No API key needed — neighborhood names are derived from a local polygon file.

```bash
npm run import:benches:sf:parse
# Smoke test first:
npm run import:benches:sf -- --limit=50
# Full import:
npm run import:benches:sf
```

Bench names are assigned in priority order: OSM name → inscription text → SF neighborhood → `SF Bench #<osmId>`.

### Adding a new city

1. Write a parse script in `scripts/bench-importer/import-<city>.js` that outputs records matching the shape in `output/benches-seattle.json`, with two additional required fields:
   - `idPrefix` — e.g. `"bench-nyc"` (must be unique per city to avoid ID collisions)
   - `sourceSystem` — e.g. `"OpenStreetMap — New York City"`
2. Add tags like `["nyc-osm"]` and set `isPark: false` or `true` as appropriate.
3. Wire up npm scripts: `import:benches:<city>:parse` and `import:benches:<city>`.
4. Run the parse script, smoke-test with `--limit=50`, then run the full upsert.
