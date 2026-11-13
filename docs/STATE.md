# STATE — end of Phase 2

## Completed in Phase 2 (verified by executed checks unless marked)
- **Migration 0002** `supabase/migrations/20261113000002_form_versions_templates.sql`:
  - `form_versions`: immutable publish snapshots (update/delete/truncate blocked by trigger, even for the table owner), unique `(form_id, version)`, composite FK target, schema validated in a CHECK.
  - `form_templates`: system templates (seeded, read-only to clients) and admin-owned templates, RLS on every operation, audit trail for create/delete.
  - `forms.published_version_id` now has a **composite FK** `(id, published_version_id) → form_versions(form_id, id)`, so a form can only point at its own versions.
  - `forms.draft_revision` (server-maintained, optimistic concurrency for autosave) and `published_revision`.
  - `publish_form(form_id, expected_revision)` RPC: admin-only, validates the stored draft in SQL, creates the next immutable version (re-uses the latest version if content is unchanged), updates the form, audits, all in one transaction.
  - `validate_form_schema(jsonb)` SQL structural validator, kept in sync with the Zod schema by a test.
  - `forms_guard_write` trigger: `status='published'`, `published_version_id` and `published_revision` can only change through `publish_form()`. `forms_guard_delete`: a form that has ever been published cannot be deleted (archive instead).
  - Column-level grants tightened on `forms` (clients cannot write server-controlled columns).
- **Field registry** (`src/fields/`): all 27 canonical field types, each with default config, metadata, Zod config schema, answer validation, export formatting, sample answer, a builder config editor and a respondent renderer. Built on one `FieldType` list in `src/schema/form.ts`.
- **Canonical schema** extended only where needed by Phase 2 (unchanged public contract; see ARCHITECTURE.md). Deep validation = Zod schema + registry checks (`validateFormDeep`, `getPublishIssues`).
- **Builder** (`/forms/:id/edit`): three-panel desktop layout, panel switcher on small screens; field palette with search; canvas with sections, drag-and-drop reordering (pointer and keyboard, dnd-kit), move up/down, move to section, duplicate, delete with confirmation, page breaks; question settings (type change, required, description, placeholder, options with bulk add, type-specific settings, validation, review notes); conditional-logic editor (show/hide/goto section, AND/OR, all operators from the engine); form settings (title, description, layout, public link slug); undo/redo (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z/Y, 100 steps, typing coalesced); live preview (same renderer as respondents); version history with read-only preview and "load into draft"; save as template.
- **Autosave**: 1.5 s debounce, saves only when content differs, confirms before reporting "saved", optimistic concurrency on `draft_revision`, conflict banner with "Load latest" or "Keep my version", blocks save on invalid drafts with the reason shown, Ctrl/⌘+S, warns before closing with unsaved changes.
- **Publishing**: validation dialog lists blocking errors and warnings; publishes through `publish_form()`; unpublish (returns to draft, keeps history); archive/restore; publish is disabled for archived forms.
- **Themes**: one canonical `ThemeSchema`; six presets; colours, typography, button style, input style, radius, progress indicator; welcome and completion screens (including redirect URL); contrast warning for low-contrast primaries; mapped to CSS variables shared with the renderer.
- **Renderer** (`src/features/renderer/`): conversational and classic layouts, welcome screen, progress indicator, per-question validation, keyboard (Enter), conditional visibility and goto navigation, hidden answers removed before submit. Used by the builder preview and the full-screen preview route. **Not yet a public page** (Phase 3).
- **Form management** (real Supabase calls, no mocked success): create blank form, create from template, rename, duplicate, delete draft (never-published only), archive/restore, unpublish, copy public link (the link is copied, the public page is Phase 3), preview, version history, templates library (use, save, delete custom).
- **Create Form** page: blank and template creation are real. Document import and AI generation are shown explicitly as **Not yet implemented (Phase 5)**.

## Test results
Executed in this sandbox on the final tree:
- `npx tsc --noEmit`: clean.
- `npx eslint .`: clean.
- `npx vitest run`: **15 files, 178 tests, all passing**. Includes 42 DB tests (migrations 0001 and 0002, RLS, immutability, publish, unauthorized publish, composite FK, lifecycle guards, template RLS), 81 registry/builder-state tests, autosave hook tests, renderer and conditional-logic tests, and theme tests.
- `npx vite build`: succeeds. Builder-side routes are lazy-loaded. The main chunk is about 770 kB (228 kB gzip), which is above Vite's 500 kB advisory; reduction is a Phase 6 item.
- Secret scan: no keys or tokens in the repository. The one textual match is a comment naming the `service_role` role in `supabase/config.toml`.

## NOT verified (honest gaps)
1. **Migrations were run on PGlite with an emulated Supabase auth layer**, not on a real Supabase Postgres 17 instance. `supabase db push` / `supabase start` were not run (no Docker, no project credentials in this sandbox).
2. **The UI was not rendered in a real browser.** No Playwright run, no screenshots, no mobile-viewport or axe checks. Layout is written responsively but unverified.
3. **No end-to-end test** of the builder against a live backend (create → edit → autosave → publish → reload). Covered by unit and hook tests only.
4. Drag-and-drop was tested only through the reducer (`move_question`), not with real pointer/keyboard events.
5. `database.types.ts` is hand-written; regenerate with `supabase gen types` once the project is linked.

## Known limitations / decisions to revisit
- **Unpublish** sets `status='draft'` and keeps `published_version_id`. Phase 3 public routes **must** check `status = 'published'`, not just the version pointer.
- **Changing a published form's slug** breaks links already shared.
- **Signatures** are stored as PNG data URLs inside the response payload (size-capped at ~300 KB). Phase 3 moves them to private storage.
- **File and image uploads** in the builder preview record file metadata only. Real uploads with signed URLs are Phase 3.
- **Image URLs** in content blocks must be `https://`. Uploading images from the device is Phase 3.
- **Templates** are structurally validated in SQL and fully validated (Zod + registry) by a test at seed time only; admin-created templates are checked for structure at the database.
- Undo history is per editing session and is not persisted.
- Form content edits are still not individually audit-logged (only create, delete, status change and publish are).

## Environment configuration (unchanged from Phase 1; see SETUP.md)
Supabase URL and anon key in `.env.local`; `supabase link` + `db push` to apply migrations 0001 and 0002; admin user created out-of-band as in SETUP.md. No new secrets were introduced in Phase 2.

## Next recommended task
1. Link the Supabase project, run `supabase db push`, confirm migrations 0001 and 0002 apply cleanly on real Postgres, and regenerate `database.types.ts`.
2. Run a Playwright pass for the builder (create, edit, reorder, autosave, publish, reload) at desktop and mobile viewports.
3. Then start **Phase 3**: public renderer route, submission RPC/edge function with server-side validation against the published version, rate limiting, and file uploads to private storage.
