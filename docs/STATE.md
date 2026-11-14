# STATE — end of Phase 6 (project complete in code)

## What is in the project
- **Builder** (Phase 2): 27 field types, drag-and-drop, sections, conditional logic, themes, autosave, undo/redo, versions, templates, live preview.
- **Public forms** (Phase 3): `/f/:slug`, server-side validation, rate limiting, private uploads, server rejection messages.
- **Responses** (Phase 4): filters, paging, detail with 5-minute signed file links, delete with storage cleanup queue, CSV and Excel export, statistics.
- **AI creation** (Phase 5): `/forms/new/ai`. Prompt-to-form and document-to-form (DOCX, PDF, XLSX, CSV, TXT, Markdown up to 10 MB). Text is extracted in the browser. The `ai-generate` Edge Function checks the caller is an active admin, enforces 30 requests per hour in Postgres, calls OpenRouter with a key that never reaches the browser, and returns JSON. The result is normalised and validated, then shown for review. Nothing is saved until the admin saves it, and the draft is saved as a draft.
- **Notifications** (Phase 6): per-form switch and recipient on the responses page. The `send-notifications` Edge Function sends an email for each new response through Resend. Emails include no answers. Queue claim is `SKIP LOCKED`, with up to five attempts.
- **Hardening** (Phase 6): CSP header in `netlify.toml`, vendor chunks split, axe-core checks on the public form and the notification card, and two browser tests.

## Migrations (apply in order)
`20261113000001` … `20261114000006` (six files). See `DEPLOY.md`.

## Test results (executed in this sandbox)
- `npm run typecheck`: clean. `npm run lint`: clean.
- `npx vitest run`: **26 files, 236 tests, all passing.** This includes the PGlite database tests for migrations 0001 to 0006, the Node tests for the Edge Function shared code, the AI client tests (normaliser, extraction for TXT, CSV, XLSX and DOCX, and the AI page flow with the model call mocked), the notification tests, and the axe accessibility tests.
- `npm run build`: succeeds. The entry chunk is about 125 kB (38 kB gzip). Largest vendor chunk is about 250 kB. The three large chunks (`exceljs`, `pdfjs`, and the PDF worker) load only when a user uploads a document or exports to Excel, so the build's size warning limit was raised with a comment in `vite.config.ts`.
- `npx playwright test`: **2 passing** in system Chrome (`/usr/bin/google-chrome`) against the production build. Covers a respondent filling and submitting a published form, and an unknown slug.
- `npm audit`: **0 vulnerabilities**.

## NOT verified (honest gaps)
- **Edge Functions were not executed.** Deno and a Supabase instance are not available here. `ai-generate` and `send-notifications` have only their shared logic tested in Node.
- **Migrations 0001–0006 have been run on PGlite only,** not on a live Supabase project. Storage policies, signed links and pg_cron are not tested on Supabase.
- **Notification scheduling is not configured.** No scheduler is included, so emails do not send until one calls `send-notifications` (see `DEPLOY.md`).
- **Real AI output quality is not measured.** Tests use mocked model responses only.
- **Browser coverage is small.** Two E2E tests. The admin flows (builder, responses, AI creation, notification settings) have not been exercised in a browser.
- **Colour contrast** is not checked by axe in jsdom. It needs a browser run.
- **Chromium download was blocked** in this sandbox, so Playwright used the system Chrome.
- **No independent security review.** See `SECURITY_REVIEW.md`.
- Excel output has been read back with `exceljs` only, not opened in Excel or LibreOffice.

## Known limitations / decisions to revisit
- Notification and AI quota limits are per admin account, not per IP. Acceptable for admin-only features.
- `style-src` allows `'unsafe-inline'` because Radix and Tailwind set runtime styles. Revisit with nonces if needed.
- A storage file that cannot be removed stays in `storage_cleanup`. Nothing retries it yet, so the cleanup needs the same scheduler as notifications.
- Export and filter dates use the browser's time zone. The server does not know the admin's time zone.
- Free-text search over responses is not implemented.
- Document parsing runs in the admin's browser. Parser versions are pinned in `package.json`.

## Next recommended steps
1. Deploy to a new Supabase project and Netlify site per `DEPLOY.md`. Run migrations 0001–0006.
2. Deploy both Edge Functions, set the secrets, and run the checks in `DEPLOY.md` step 7.
3. Configure the scheduler for `send-notifications` and the storage cleanup.
4. Add E2E coverage for the admin flows.
