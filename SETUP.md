# Local Setup (Step-by-Step)

## 1. Create `.env.local`

In the `web/benchmark-pwa` folder, create a file named `.env.local` (it's gitignored, so your secrets stay local).

## 2. Get your Supabase credentials

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click your project
3. Click **Project Settings** (gear icon in the left sidebar)
4. Click **API** in the left menu
5. Copy these two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **service_role** key (click "Reveal" if hidden, then copy the long string)

## 3. Add them to `.env.local`

Open `.env.local` and paste this, then replace the placeholders with your actual values:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Example (with fake values):

```
NEXT_PUBLIC_SUPABASE_URL=https://xyzabc123.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5emFiYzEyMyIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE2...
```

## 4. Save and run

```bash
cd web/benchmark-pwa
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001). The app should load benches from Supabase.
