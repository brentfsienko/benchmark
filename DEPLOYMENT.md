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
   - `NEXT_PUBLIC_SITE_URL` = `https://benchmark.rest`
   - `NEXT_PUBLIC_BENCHMARK_CURRENT_USER_ID` = `user-1` (optional)
5. Deploy

## 3b. Supabase Auth redirect URLs

In [Authentication → URL Configuration](https://supabase.com/dashboard/project/ygpwlmfdhshobeotuzad/auth/url-configuration):

1. **Site URL** → `https://benchmark.rest`
2. **Redirect URLs** (allow list) include at least:
   - `https://benchmark.rest/**`
   - `http://localhost:3001/**` (local dev)
   - optional preview: `https://*-your-team.vercel.app/**`

Without this, email confirmation / magic links will reject `benchmark.rest` redirects.

## 3c. Auth emails via Resend (required for production)

Supabase’s **built-in** email sender is limited to **~2 emails/hour**. Benchmark sends auth mail through **Resend** via a Send Email hook in this app.

### 1) Create Resend account + API key

1. Sign up at [resend.com](https://resend.com) (free: 3,000 emails/mo, 100/day)
2. Create an API key
3. Optional but recommended: verify domain `benchmark.rest`, then send from `noreply@benchmark.rest`
   - Until the domain is verified, use `Benchmark <onboarding@resend.dev>` (works for testing to your own inbox)

### 2) Add Vercel / local env vars

```
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM_EMAIL=Benchmark <noreply@benchmark.rest>
SEND_EMAIL_HOOK_SECRET=v1,whsec_xxxxxxxxx
NEXT_PUBLIC_SITE_URL=https://benchmark.rest
```

`SEND_EMAIL_HOOK_SECRET` is generated when you enable the hook in Supabase (next step). Paste the full value including the `v1,whsec_` prefix.

### 3) Enable the Send Email hook in Supabase

1. Open [Authentication → Hooks](https://supabase.com/dashboard/project/ygpwlmfdhshobeotuzad/auth/hooks)
2. Enable **Send Email**
3. HTTPS endpoint: `https://benchmark.rest/api/auth/send-email`
4. Copy the generated secret into `SEND_EMAIL_HOOK_SECRET` on Vercel and redeploy
5. Open [Authentication → Rate Limits](https://supabase.com/dashboard/project/ygpwlmfdhshobeotuzad/auth/rate-limits) and raise **Email sent** if needed (e.g. `100`/hour)

Do **not** also rely on Supabase’s built-in SMTP once the hook is enabled — the hook replaces it.

### Alternative: Resend SMTP (no app code)

If you prefer dashboard-only SMTP instead of the hook:

- Host `smtp.resend.com`, port `465`, user `resend`, password = Resend API key
- Configure at [Authentication → SMTP](https://supabase.com/dashboard/project/ygpwlmfdhshobeotuzad/auth/smtp)

### Temporary unblock (dev only)

[Auth → Providers → Email](https://supabase.com/dashboard/project/ygpwlmfdhshobeotuzad/auth/providers) → turn off **Confirm email** until Resend is live.

## 4. Make the app public (everyone can open it)

Explore is already public in code — no invite list. Sign-in is only required for `/home` and for submitting benchmarks.

If friends still hit a Vercel login / “Authentication Required” wall:

1. Open the project on [vercel.com](https://vercel.com) → **Settings → Deployment Protection**
2. Set **Production** (and Preview if you want) to **Disabled**, or add them under **Shareable Links / Allowed emails**
3. Also check **Settings → Deployment Protection → Vercel Authentication** — turn it off for Production if you want a fully open URL
4. Redeploy if the change doesn’t take effect immediately

Optional: under **Domains**, use your custom domain as the share link so people aren’t on a protected `*.vercel.app` preview.

Admin-only actions (add / move / rename / delete benches) stay limited to allowlisted emails in `src/lib/admin.ts`.

## 5. Global-scale map pins

Explore never loads “all benches.” It queries the current map viewport via `list_bench_pins`.

For millions of benches worldwide, run **`supabase/global_scale_bench_pins.sql`** in the Supabase SQL editor. That:

- stores `review_count` on each bench (updated by trigger — no full-table review scan per pan)
- adapts LIMIT + grid sampling when zoomed out
- handles the antimeridian (±180°)

## 6. Local Development

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
