# STATE — end of Phase 3

## Completed in Phase 3
- **Migration 0003** `supabase/migrations/20261113000003_public_submissions.sql`:
  - `submissions` (immutable: update blocked by trigger; pinned to the exact version via composite FK `(form_id, form_version_id) → form_versions`), `submission_files`, `pending_uploads` (upload reservations), `rate_limit_events` (fixed-window counters). RLS on all; anon has no direct access. Admins can read and delete responses; nobody can edit them.
  - `get_public_form(slug)`: published forms only; strips `aiNotes` (internal review notes).
  - `request_upload(slug, question, name, mime, size)`: rejects non-file questions, MIME types on a deny list (html, svg, javascript, xml, executables, scripts), types outside the question's allow list, oversize files, and anything over the rate limit. Returns an unguessable path `<form_id>/<uuid>/<sanitised name>`.
  - `submit_response(slug, answers, user_agent)`: rate limited per form and hashed network address (10 per 10 minutes); validates against the **published** version in SQL; evaluates conditions server-side and stores only visible answers; checks each file against its reservation (form, question, not used, not expired, size, type, storage object present and matching when Storage exists); stores file metadata from the server's reservation, not the client's payload; consumes reservations atomically with the submission.
  - SQL mirrors of the rules engine (`sf_eval_condition`, `sf_eval_rule`, `sf_is_visible`, `sf_effective_answers`) and of the field validators (`sf_validate_answer`, `validate_submission`).
  - Storage: a private `submissions` bucket and `storage.objects` policies, created only when the `storage` schema exists (Supabase). Anon may insert only into a live reservation path; admins may read.
- **Public route** `/f/:slug` (`PublicFormPage`), outside the admin guard. Uses the same `FormRenderer` as the preview, with conversational and classic layouts, conditional display, thank-you screen, and not-found and error states.
- **Server rejections** are shown next to the questions they belong to, and the form jumps to the first one (`SubmissionRejected`). Other errors (rate limit, expired form) show as plain text, with answers kept.
- **Uploads**: `FilesInput` uploads through a `FileUploaderContext` on the public page: reserve with `request_upload`, then upload to storage. The builder preview still only records metadata and sends nothing.
- **Completion screen**: the redirect link renders only for http(s) URLs (blocks `javascript:` links). On the public page, the redirect is shown as a button, not as an automatic redirect.
- `.env.example` restored from the Phase 1 commit (public values only; server secrets are listed as Edge Function secrets).

## Test results (executed in this sandbox)
- `npx tsc --noEmit`: clean.
- `npx eslint .`: clean.
- `npx vitest run`: **17 files, 195 tests, all passing**. New: `tests/db/migration0003.test.ts` (14 tests: access rules, RLS, publication pinning, validation, hidden answers, rate limit, uploads and their rejection paths, one-use reservations, and a **40-case parity corpus** comparing the SQL validator to `validateVisible` and `effectiveAnswers`); `src/features/renderer/submit.test.tsx` (server rejection display, failure text, URL guard).
- `npx vite build`: succeeds. Main chunk about 822 kB (242 kB gzip), up from 770 kB because of the public route and upload code. Above Vite's 500 kB advisory; splitting is a Phase 6 item.

## NOT verified (honest gaps)
- **Not run against real Supabase.** Migrations 0001–0003 were executed on PGlite with an emulated `auth` schema. The Storage bucket and `storage.objects` policies (the `DO` block) run only on a real Supabase project and are untested here.
- **No Edge Functions.** The sandbox has no Deno, Docker or Supabase CLI runtime, so all server logic is in Postgres. None of it runs in an Edge Function.
- **No browser run.** The public page, the upload flow and the thank-you screen have not been exercised in a browser or against live Storage. No E2E tests.
- **Rate limiting by network address** uses the first `x-forwarded-for` value. Behind a gateway that overwrites this header it is accurate. Otherwise a client can spoof it. Treat the limit as abuse dampening, not a security boundary, until verified at the real gateway.
- **Signatures are not in private storage.** They are still stored inline in answers as PNG data URLs (server cap 300,000 characters). The spec asks for private storage for files; signatures are a deviation to resolve in Phase 6.

## Known limitations / decisions to revisit
- Reservations that are never submitted leave their object in the bucket. The reservation expires after one hour, but nothing deletes the object. A cleanup job belongs in Phase 6.
- File safety is limited to MIME allow/deny lists and size. There is no malware scanning. If a question has no allow list, any MIME type not on the deny list is accepted, so set `allowedMimeTypes` on every upload question.
- Responses are readable only through SQL or the admin RLS policy for now. The response UI is Phase 4.
- Respondent answers are stored as submitted (after server validation). The export and anonymisation rules are a Phase 4 decision.

## Environment configuration
See SETUP.md. Restored `.env.example` lists only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the frontend.

## Next recommended task
Phase 4: response listing, detail view with private file access, CSV and Excel export, and basic analytics. Before that, run migrations 0001–0003 on a real Supabase project to confirm the Storage policies and the public functions.
