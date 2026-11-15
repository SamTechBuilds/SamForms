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
  OPENROUTER_MODEL=openrouter/free \
  OPENROUTER_FALLBACK_MODELS=<optional: comma-separated free ":free" model IDs> \
  NOTIFY_CRON_SECRET=<long random string> \
  EMAIL_PROVIDER_API_KEY=<resend api key> \
  NOTIFY_FROM="Sam Forms <forms@your-domain>" \
  NOTIFY_APP_URL=https://<your-netlify-site>
```

### CORS for ai-generate

The function allows browser requests only from a built-in allowlist in `supabase/functions/_shared/cors.ts`: `http://localhost:5173` (local development) and `https://stbforms.netlify.app` (production). No secret controls CORS, so `APP_ORIGIN` is no longer read. Any other origin gets 403 with no allow-origin header. Preflight (`OPTIONS`) is answered before authentication, so it does not depend on secrets being set. Every other response, including errors, carries the CORS headers. To add an origin, edit `ALLOWED_ORIGINS` and redeploy. `verify_jwt = true` stays on in `supabase/config.toml`; the function still checks admin rights inside the database.

Deploy after changing the function:

```bash
npx supabase functions deploy ai-generate
```

Check the preflight from the terminal (this is a check you run after deploying; it was not run from the build sandbox):

```bash
curl -i -X OPTIONS https://cdotqcphnuheqqdhrnpp.supabase.co/functions/v1/ai-generate \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization, apikey, x-client-info, content-type"
```

The response should be `204` with `Access-Control-Allow-Origin: http://localhost:5173`.

The browser build must point at the same project. Set `VITE_SUPABASE_URL=https://cdotqcphnuheqqdhrnpp.supabase.co` and the matching `VITE_SUPABASE_ANON_KEY`. Without `VITE_SUPABASE_URL`, the client falls back to `http://localhost:54321`, so AI requests go to the wrong place.

### AI model configuration (free models only)

- `OPENROUTER_MODEL` should be `openrouter/free`, OpenRouter's router over eligible free models.
- `OPENROUTER_FALLBACK_MODELS` is optional: a comma-separated list of exact model IDs ending in `:free`, for example `<vendor>/<model>:free,<vendor>/<model2>:free`. At most 4 models in total, including the primary.
- **Price verification:** before any model is called, its pricing is checked against OpenRouter's public model list (`GET https://openrouter.ai/api/v1/models`, no key sent). A configured model must show zero prompt and completion pricing or it is dropped. The model that answers is verified the same way. If the price list cannot be loaded, no draft is generated (fail closed). The list is cached for 10 minutes per function instance.
- **Refused configuration:** any entry that is not `openrouter/free` or does not end in `:free` is refused, and the function reports a configuration error. Paid models are never called.
- **Stop rules:** a 401, 402 or 403 stops straight away (key or account problem). A 429 that OpenRouter reports as a platform limit (free per-minute or per-day quota, both account-wide) also stops straight away. Switching models cannot bypass these. A 429 caused by an upstream provider moves on to the next model. Unavailable models (404), provider errors (5xx), timeouts and unreadable replies move on to the next model. An unverified reply stops the chain.
- **Canonical validation:** every draft is checked against the shared form schema on the server before it is returned. A draft that cannot be used returns HTTP 422 with `code: "invalid_form"` and no schema.
- **Response metadata:** successful responses include `meta` with `strategy` (`router` or `fallback-chain`), `model` (the model that answered), `fallbackUsed`, `attempts`, `success` and `durationMs`. Logs record model IDs and timings only, never prompts, documents or replies.
- **Import map:** the shared schema imports `zod`. `supabase/functions/import_map.json` maps it to `npm:zod@4.6.7`, and `supabase/config.toml` points `ai-generate` at that map. Check that the Supabase CLI version you deploy with honours `[functions.ai-generate] import_map` before relying on it.
- **Limits:** OpenRouter free models are limited to 20 requests per minute per account. Accounts with under $10 of lifetime credit purchases get 50 free requests per day; accounts at or above that threshold get 1,000. The daily cap is shared across all free models.

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
