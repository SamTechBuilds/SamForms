# Architecture
## Layout
```
src/schema/        canonical Zod+TS schema, condition engine (pure, shared by browser AND edge functions)
src/fields/        field registry (one entry per FieldType: defaults, config schema, builder editor, renderer, answer validator, export formatter)
src/features/{auth,dashboard,forms,builder,renderer,responses,templates,import,ai,settings}/
src/lib/           supabase client, utils
supabase/migrations/   SQL migrations
supabase/functions/    submit-form, upload-url, ai-generate, extract-notify, export (Deno)
```
## Key decisions
1. **Schema is the contract.** `FormSchema` (src/schema/form.ts) is imported by builder, importer, AI adapter, renderer, response viewer and edge functions. Per-type config lives in `question.config`, validated by the registry — so adding a field type = one registry entry.
2. **Shared pure code.** Schema + condition engine have no DOM/React deps so Edge Functions re-use them for server-side submission validation (no divergence between client and server).
3. **Versioning.** `forms.draft_schema` (mutable) → Publish copies into `form_versions` (immutable, enforced by trigger blocking UPDATE/DELETE). Editing a published form edits the draft; republish = new version number. Submissions FK to `form_versions.id`.
4. **Public submission path.** Browser → Edge Function `submit-form` (service role inside function only) → loads published version → validates answers with schema + registry validators → rate-limits (IP hash + form) → inserts. No anon INSERT/SELECT policies on `submissions`.
5. **Files.** Private Storage bucket; respondent uploads via short-lived signed upload URLs issued by an Edge Function after type/size checks; admin downloads via signed URLs only.
6. **AI.** Edge Function `ai-generate` → provider adapter interface (`OpenRouterProvider` first) → JSON output → `FormSchema.safeParse` (+ one repair retry) → returned for *review only*, saved as draft on admin confirm. Uncertainty surfaces as `aiNotes` warnings. Source documents are extracted client-side; only needed text is sent; no source file stored (retention: none by default).
7. **State/routing.** React Router; TanStack Query is *proposed* for server state (small, justified: caching/autosave) — decide in Phase 1.
8. **Builder autosave.** Debounced writes to `forms.draft_schema` with optimistic version check (`updated_at`) to avoid clobbering.
## Deployment
Netlify (SPA redirect, env vars) + Supabase (migrations via CLI, secrets via `supabase secrets set`).

## Phase 1 decisions
- **TanStack Query adopted** (justified): dashboard/list queries need caching, loading/error/retry states, and Phase 2 autosave/invalidation. Used only in `src/features/*/api.ts`.
- **Auth state machine** (`auth-context.ts`): loading | signed_out | unauthorized | error | authorized. A verification failure is its own state and never grants access.
- **UI kit**: shadcn-style components written by hand in `src/components/ui` (Radix Slot + CVA + tailwind-merge). `components.json` is present so `npx shadcn@latest add <component>` works on your machine.
- **Versions:** Tailwind 3.4 (stable with shadcn tooling), Vite 5, React 18, React Router 7.18 (v6 had open advisories), **zod 4.6.7** (zod 3 had a high-severity memory-exhaustion advisory relevant to parsing untrusted payloads in Phases 3/5). `npm audit --omit=dev` = 0 vulnerabilities. NOTE zod 4 `.default()` no longer re-parses its default, so object defaults that need inner defaults must use `.prefault()` (fixed for `theme`).
- **DB tests** run on PGlite with a Supabase auth stub (roles anon/authenticated, `auth.uid()` from `request.jwt.claim.sub`).
- Placeholder routes (Create Form, Responses, Templates) render an explicit "Not yet implemented — Phase N" page; disabled create buttons are labelled.
