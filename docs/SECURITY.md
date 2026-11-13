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
