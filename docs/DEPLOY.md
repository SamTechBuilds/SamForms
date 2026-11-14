# Deploying Sam Forms

This guide assumes a new, independent Supabase project and a Netlify site. Nothing here touches other projects.

## 1. Create the Supabase project

Create a new project. Keep these values, which you will need later:

- Project URL (`https://<ref>.supabase.co`)
- Anon (public) key. This is the only key the frontend ever receives.
- Service role key. Server-side only. Never put it in Netlify, `.env` files, or any frontend code.

## 2. Apply the migrations in order

Apply files in `supabase/migrations/` in filename order. The set is 0001 to 0006:

1. `20261113000001_admin_forms_audit_settings.sql`: admins, forms, audit log, settings
2. `20261113000002_form_versions_templates.sql`: published versions and templates
3. `20261113000003_public_submissions.sql`: public access functions and submissions
4. `20261114000004_response_management.sql`: uploads, storage cleanup, response management
5. `20261114000005_ai_quota.sql`: hourly AI quota per admin
6. `20261114000006_notifications.sql`: notification settings, queue, claim and complete functions

With the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`. Or paste each file into the SQL editor in order.

Then create the first admin: follow `SETUP.md`. Admin accounts are rows in `admin_users`, not open sign-ups.

## 3. Set Edge Function secrets

Values are stored by Supabase and read by the functions at runtime. Set them with the CLI:

```bash
supabase secrets set \
  OPENROUTER_API_KEY=<key> \
  OPENROUTER_MODEL=<model id from openrouter.ai> \
  APP_ORIGIN=https://<your-netlify-site> \
  NOTIFY_CRON_SECRET=<long random string> \
  EMAIL_PROVIDER_API_KEY=<resend api key> \
  NOTIFY_FROM="Sam Forms <forms@your-domain>" \
  NOTIFY_APP_URL=https://<your-netlify-site>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions by Supabase. Do not set them yourself.

Generate `NOTIFY_CRON_SECRET` with `openssl rand -hex 32`.

## 4. Deploy the Edge Functions

```bash
supabase functions deploy ai-generate
supabase functions deploy send-notifications --no-verify-jwt
```

`send-notifications` is called by a scheduler, not a user, so it does not use a user JWT. It checks the `x-cron-secret` header instead. `ai-generate` keeps JWT verification on, and it also checks that the caller is an active admin.

## 5. Schedule the notification sender

The migrations do not create a scheduler, because the URL and secret are environment-specific. Choose one:

- **pg_cron + pg_net** (runs inside Supabase). Store the secret in Supabase Vault, then schedule a POST to
  `https://<ref>.supabase.co/functions/v1/send-notifications` every five minutes with the header `x-cron-secret`.
- **External scheduler** (GitHub Actions, cron on another host, or a hosted cron service). Send the same POST on the same schedule.

Each run sends at most 20 pending emails. Failed sends are retried up to five attempts, then marked failed.

## 6. Deploy the frontend to Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- Environment variables (build time):
  - `VITE_SUPABASE_URL` = project URL
  - `VITE_SUPABASE_ANON_KEY` = anon key

`netlify.toml` already sets the security headers and the Content-Security-Policy, and it redirects all routes to `index.html`.

In Supabase Auth settings, add the Netlify site URL to the allowed redirect URLs, so password reset works.

## 7. Verify after deploy

- Sign in as the admin. Create a form, publish it, and open the public link in a private window.
- Submit a response. It should appear in Responses.
- Turn on email notifications for the form, submit again, and run the scheduler once. The email should arrive without answer content.
- Generate an AI draft from a prompt and from a document. Review it before saving.
- Check that the page's response headers include the Content-Security-Policy.

## Status of these steps

The frontend build, unit and database-migration tests, accessibility checks, and the browser tests were executed in the build sandbox. The Edge Functions (`ai-generate`, `send-notifications`) were not run there, because Deno and a Supabase instance were not available. Test them with the steps above before relying on them.
