# Implementation plan

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundation: repo, docs, canonical schema, security model, test plan | Done |
| 1 | Auth, allowlisted admin, dashboard shell, migration 0001 (RLS, audit) | Done (live Supabase verification pending credentials) |
| 2 | **Form builder**: migration 0002 (immutable versions, templates, publish RPC), 27-type field registry, three-panel builder with drag-and-drop, sections and page breaks, conditional-logic editor, themes, autosave, undo/redo, publish/unpublish/archive/duplicate/rename/delete, version history, templates, live preview | **Done** (see STATE.md for verification limits) |
| 3 | Public renderer route, submission RPC/edge function with server-side validation, rate limiting, private file upload | Next |
| 4 | Response listing, detail, private file access, CSV and Excel export, analytics | Planned |
| 5 | AI: document extraction (DOCX, PDF, XLSX, CSV, TXT), OpenRouter adapter, document-to-form, prompt-to-form, review UI | Planned (Create Form shows these as not yet implemented) |
| 6 | Email notifications, security review, performance (bundle size), accessibility, E2E tests, deployment docs | Planned |

Phase 2 deliberately does not include public form pages, submissions, exports or AI. Those are Phases 3–5.
