# Benchmark (Next.js PWA)

Mobile-first PWA for discovering and logging park benches. Next.js + Supabase.


## Local Run

1. `npm install`
2. Copy `.env.example` to `.env.local` and add your Supabase credentials (see [SETUP.md](./SETUP.md))
3. `npm run dev`
4. Open [http://localhost:3001](http://localhost:3001)

## Deploy to Vercel

See [DEPLOYMENT.md](./DEPLOYMENT.md). Quick steps:

1. Push your repo to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Add Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
4. Deploy

## Quality Gate

- `npm run quality:ci` — lint, type-check, unit tests
- `npm run test:e2e` — Playwright smoke tests

## Screens

- `/home` — activity feed
- `/explore` — discovery and map
- `/bench/[id]` — bench detail + submit
- `/add` — create new bench
- `/challenges` — gamification
- `/profile` — profile + wishlist
- `/ops` — moderation controls
