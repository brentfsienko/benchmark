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

There is no separate backend process. The same Next.js app serves pages and the JSON API.

```
┌─────────────────────────────────────────────────────────┐
│  Browser (PWA)                                          │
│  app/* pages  ·  src/components  ·  src/contexts        │
│  src/lib/api.ts  ──fetch──►  /api/v1/*                  │
└──────────────────────────────┬──────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────┐
│  Next.js on Vercel                                      │
│  app/api/v1/*   Route handlers (BFF)                    │
│  middleware.ts  Session refresh, /home auth gate        │
│  src/lib/supabase/*  Admin + user clients               │
└──────────────┬───────────────────────────┬──────────────┘
               │                           │
               ▼                           ▼
        Supabase                     MapTiler / Resend
        Postgres + PostGIS           Tiles / auth email
        Auth + storage
```

### Frontend

| Piece | Role |
| --- | --- |
| `app/` | App Router pages (`/explore`, `/home`, `/bench/[id]`, auth, profile, challenges, ops) |
| `src/components/` | Map, sheets, feed cards, nav, photos |
| `src/contexts/auth-context.tsx` | Session + profile for client components |
| `src/lib/api.ts` | Typed `fetch` wrapper. Defaults to same-origin `/api/v1` |
| Leaflet + MapTiler | Raster basemap, clustered pins on explore |

UI is client-heavy where it needs map/geolocation (`"use client"`). List and detail pages still render through Next.js; data comes from the API, not directly from Supabase in the browser (except Auth).

### Backend

| Piece | Role |
| --- | --- |
| `app/api/v1/**/route.ts` | REST-ish JSON API: benches, reviews, users, follows, challenges, reports, admin flags |
| `src/lib/request-auth.ts` | Who is calling (cookie session) |
| `src/lib/supabase/admin.ts` | Service-role client for privileged DB work |
| `src/lib/supabase/server.ts` | Cookie-bound user client |
| `supabase/migrations/` | Schema, PostGIS geometry, seed |

API responses use `{ data }` / `{ error }` via `src/lib/api-response.ts`. Spatial queries (nearby, pins in viewport, coverage) go through PostGIS RPCs.

Auth emails are not sent by Supabase’s built-in mailer in production. A Send Email hook hits `app/api/auth/send-email`, which uses Resend. See [DEPLOYMENT.md](./DEPLOYMENT.md).

### Screens

| Route | What it is |
| --- | --- |
| `/explore` | Map + carousel, filters, coverage request |
| `/home` | Activity feed (signed in) |
| `/bench/[id]` | Detail, reviews, submit |
| `/add` | Create a bench (admin-gated today) |
| `/challenges` | Challenges + progress |
| `/profile`, `/user/[id]`, `/friends` | Profile, follows, wishlist |
| `/ops` | Moderation / admin |
| `/auth/*` | Login, signup, callbacks |

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
