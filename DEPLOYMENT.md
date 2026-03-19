# Deploying Benchmark Web to Vercel + Supabase

Single deploy: Next.js (Vercel) + Supabase (Postgres). No separate backend.

## Prerequisites

- [Vercel](https://vercel.com) account
- [Supabase](https://supabase.com) account
- Git repository (GitHub, GitLab, or Bitbucket)

## 1. Create Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a project
2. In **Database → Extensions**, enable **PostGIS**
3. In **Project Settings → API**, copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Service role key** (secret) → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Run Migrations

**Easiest:** In Supabase **SQL Editor**, open `supabase/migrations/00000_full_schema_and_seed.sql`, copy all of it, paste into the editor, and click **Run**. Done in one step.

## 3. Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your Git repository
3. Root directory is the repo (no override needed)
4. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service role key
   - `NEXT_PUBLIC_BENCHMARK_CURRENT_USER_ID` = `user-1` (optional)
5. Deploy

## 4. Local Development

```bash
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
npm install
npm run dev
```

Open `http://localhost:3001`. The API runs at `/api/v1/*` on the same origin.

## Optional: Use External Go Backend

To use the original Go backend instead of Supabase, set:

```
NEXT_PUBLIC_BENCHMARK_API_BASE_URL=http://127.0.0.1:8080/api/v1
```

Leave Supabase vars unset. The app will proxy requests to the external API.
