# Security Model
- **AuthN/Z:** Supabase Auth, public signup disabled; `admin_users` allowlist; every admin RLS policy and edge function re-checks `is_admin()` server-side. Frontend route guards are UX only.
- **Secrets:** service-role, OpenRouter and email keys only in Edge Function secrets. Only anon key + URL in frontend. `.env` git-ignored; `.env.example` committed.
- **Public submissions:** edge function validates against the exact published version schema; unknown question IDs rejected; payload size cap; honeypot + per-IP/form rate limit (hashed IP); consistent error shapes without internals.
- **Files:** allowlisted MIME + extension + magic-byte sniff where feasible, size caps, randomized storage paths, private bucket, signed URLs (short TTL) for admin only.
- **Data:** answers rendered as text (React escaping); exports escape CSV formula injection (`= + - @` prefix); regex `validation.pattern` run with length-limited input.
- **AI:** keys server-side; prompt injection treated as hostile — output only ever parsed as data through Zod, never executed/rendered as HTML; source text minimized; admin must review; never auto-publish.
- **Audit:** login, publish/unpublish, delete, export, settings changes logged to append-only `audit_logs`.
- **Headers:** CSP, X-Frame-Options (public forms embeddable only if enabled later), Referrer-Policy via Netlify `_headers`.
## Known risks to track
Rate limiting without Redis relies on DB counters; signature/image fields need size caps; PDF.js worker CSP config.

## Phase 1 implementation notes
- Authorization = `admin_users` row (active) via `is_admin()`; used by every policy. The frontend reads the same row only to decide what to render.
- Signup disabled in `config.toml`; even if a stray Auth user exists, RLS tests prove a non-admin reads zero rows and cannot write anything (tests/db).
- Login errors are generic; password reset always shows the same message (no account enumeration). Password policy (12+, upper/lower/digit) mirrored client-side from `config.toml`.
- Login/logout and form create/delete/status changes are audited server-side.
- No service-role key anywhere in `src/` (scan run; see STATE.md). `.env*` ignored except `.env.example`.
- Not yet done (planned): CSP (Phase 6), MFA for the admin (recommended; consider enabling TOTP before production), brute-force rate limits beyond Supabase Auth defaults, forms trigger audits only status/create/delete (content edits are not individually logged).


## Phase 2 additions
- **Publishing is server-authoritative.** Only `publish_form()` can make a form published or change its live version. It checks admin status, validates the stored draft and writes an audit row. Clients get no direct write path to those columns (guard trigger plus column grants). Tests: `tests/db/migration0002.test.ts` ("unauthorized publishing", "a client cannot publish by direct update").
- **Immutable history.** Published versions cannot be updated or deleted by anyone, including the table owner. Truncation is blocked too.
- **Optimistic concurrency.** Autosave and publish send the expected `draft_revision`, so a stale tab cannot silently overwrite newer work (returns a conflict).
- **Templates** are read-only for clients when they are system templates, and each admin can change only their own templates.
- **No user-supplied code** is evaluated. Conditional logic is data (`Rule`/`Condition`), evaluated by the shared engine. Regular-expression validation patterns are compiled inside `try` with an input length cap, and an invalid pattern is reported as an issue rather than run.
- **Input limits** on the server and in the schema: text length, option counts, form size (1 MB), theme values, redirect and image URLs (https only for images), data URLs for signatures (PNG only, ~300 KB).
- **Client-side redirect URL** must be http(s). The completion redirect and image URLs are checked by the schema before save.
- **Known gap:** the publish RPC and template policies have been tested on PGlite with an emulated `auth.uid()`, not on real Supabase Auth. Re-run on a linked project.
