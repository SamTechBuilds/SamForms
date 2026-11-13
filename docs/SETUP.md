# Setup (what only you can do)
## 1. Create the independent Supabase project
Dashboard → New project (separate from every other project). Then Project Settings → API: copy **Project URL** and **anon public key**.
## 2. Frontend env
`cp .env.example .env.local` and fill `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Never put the service-role key in any `VITE_*` variable.
## 3. Link and apply the migration
```
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push          # applies supabase/migrations/*.sql (no Docker needed for remote push)
```
## 4. Push Auth settings (signup OFF, password policy)
`config.toml` sets `enable_signup=false`, min length 12, lower+upper+digit. For the *hosted* project also set the same in Dashboard → Authentication → Sign In / Providers (disable "Allow new users to sign up") and → Policies. `supabase config push` can sync it.
Add redirect URLs (Authentication → URL Configuration): `http://localhost:5173/reset-password` and your Netlify `/reset-password` URL. Set Site URL to the Netlify URL for production.
## 5. Create the Super Admin
Dashboard → Authentication → Users → Add user (email + strong password, auto-confirm). Then run `supabase/seed-admin.example.sql` (with your email) in the SQL editor. Only this row grants access.
## 6. Run
`npm install && npm run dev` → http://localhost:5173
## Later-phase credentials (not needed yet)
OpenRouter API key + model, email provider key, Netlify site. All server-side secrets via `npx supabase secrets set`.
## Local DB without Docker
`npm run test:db` runs the migrations against an in-process Postgres (PGlite) with an emulated Supabase auth stub. This is *not* a substitute for testing on real Supabase (see STATE.md known issues).

## Phase 3: public forms and storage
Apply migrations 0001–0003 to your Supabase project (`npx supabase db push`, or paste the SQL in order). Migration 0003 creates the private `submissions` bucket and its policies automatically when the `storage` schema exists. Confirm in Storage that `submissions` is private (not public). Public links look like `https://<your-site>/f/<slug>`.
