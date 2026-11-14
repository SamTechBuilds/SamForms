# Security review — Sam Forms

Scope: the frontend (React SPA on Netlify), the Supabase schema and RLS, the Edge Functions, and dependencies. This is a review of the code in this repository. It is not a penetration test, and it has not been done by an independent party.

## Controls in place

| Area | Control | Evidence |
|---|---|---|
| Secrets | The service role key is used only by `send-notifications` (server). OpenRouter and email keys are Edge Function secrets. Only the anon key is built into the frontend. | `supabase/functions/*/index.ts`, `DEPLOY.md` |
| Data access | Row Level Security on every public table. Admins are checked through `is_admin()` backed by `admin_users`. | `tests/db/migration0001.test.ts` (asserts RLS on every table) |
| Public access | Respondents reach data only through narrow SECURITY DEFINER functions with `search_path = ''`. | migration 0003, public-api tests |
| Responses | Responses are immutable, enforced by triggers. | migration 0002/0004 tests |
| Uploads | Size and MIME are checked by the server reservation, not only in the browser. | Phase 4 tests |
| AI | Admin-only, checked in the function and in SQL. Hourly quota is enforced in Postgres (`consume_ai_quota`) before the model is called. Prompt and document length are capped on both sides. Document text is wrapped in `<source>` tags and treated as data. Model output is parsed, normalised, and validated, then a human reviews it before saving. Output is never executed. | `supabase/functions/_shared/ai.ts`, `src/features/ai/normalize.ts`, `tests/functions/shared.test.ts`, `tests/db/migration0005-0006.test.ts` |
| Notifications | Emails contain no response answers. The cron endpoint compares its secret in constant time. Recipients are validated in the browser and by a database check. The queue is claimed with `FOR UPDATE SKIP LOCKED`. | `supabase/functions/_shared/notify.ts`, migration 0006 |
| Browser | Strict CSP (`script-src 'self'`, no inline scripts, `frame-ancestors 'none'`, `object-src 'none'`). Renderer blocks `javascript:` redirect URLs. | `netlify.toml`, `FormRenderer`, `safeHttpUrl` |
| Dependencies | `npm audit` reports 0 vulnerabilities after overrides for `tinypool` and `minimatch`. | `package.json` overrides |

## Findings and status

1. **Edge Functions are not executed in this sandbox.** Their shared logic is unit tested in Node. Their Deno entry points are not. Before production, deploy to a test project and exercise: admin-only refusal, quota at 30 per hour, malformed input, and the cron secret check. *Open.*
2. **Scheduling is not configured by the repository.** Notifications will not send until a scheduler calls `send-notifications` (see `DEPLOY.md` step 5). *Open, by design.*
3. **Quota is per admin account, not per IP.** That is appropriate for admin-only AI, but it does not stop a leaked admin session. Rotate sessions if an admin account is compromised. *Accepted.*
4. **`style-src` allows `'unsafe-inline'`.** Radix and Tailwind set inline styles at runtime. Removing it would require nonces or hashes on those runtime styles. *Accepted for now.*
5. **Uploaded documents are parsed in the browser.** PDF and DOCX parsing runs on the admin's machine, not on the server. A malicious file can only affect that admin's tab. Parser libraries are pinned and their versions are listed in `package.json`. *Accepted.*
6. **No independent review.** Treat this document as the author's review, not an audit. *Open.*

## Reporting

Report suspected vulnerabilities to the project owner directly. Do not open a public issue for security problems.
