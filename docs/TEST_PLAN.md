# Test Plan
Tools: Vitest (unit), Supabase local + SQL/pgTAP-style RLS tests (integration), Playwright (E2E, mobile viewports), tsc, ESLint.
| Area | Level | Phase |
|---|---|---|
| Schema validity/defaults/cross-refs, malformed AI output | unit | 0 ✅ |
| Condition engine (all operators, AND/OR) | unit | 0 ✅ |
| Auth guard/provider/login UI (mocked Supabase), RLS + constraints for 0001 tables (PGlite) | unit+integration | 1 ✅ |
| Auth against a real Supabase project, RLS on later tables | integration | 1 (pending credentials) / 2+ |
| Field registry completeness, defaults, validation, export formatting | unit | 2 ✅ (178 tests total, Phase 2 included) |
| Builder reducer: CRUD, reorder across sections, duplicate, type change, section delete, undo/redo coalescing | unit | 2 ✅ |
| Autosave: debounce, confirmed-saved, conflict pause/overwrite, invalid-draft block | unit (hook) | 2 ✅ |
| Conditional visibility, goto, pages, validation of visible questions | unit | 2 ✅ |
| Renderer flow: welcome, required validation, conditional question, submit payload, classic layout | component (jsdom) | 2 ✅ |
| Theme presets and CSS mapping, contrast warnings | unit | 2 ✅ |
| Builder UI end to end (create, edit, reorder, autosave, publish, reload), mobile layout, a11y | E2E (Playwright) | 2 **pending** |
| Publish immutability, versioning, unauthorized publishing, composite FK, lifecycle guards, templates RLS (PGlite) | integration | 2 ✅ |
| The same publish/RLS tests on a real Supabase project | integration | 2 **pending** (credentials) |
| Public access, conditional display, server validation, uploads, rate limit | integration+E2E | 3 |
| Response privacy, exports (incl. formula-injection escaping) | integration | 4 |
| Extractors, import failures, AI success/failure/malformed | unit+integration (mocked provider) | 5 |
| Mobile layout, a11y (axe), full flow | E2E | 6 |

## Phase 2 execution record
Executed in the sandbox: `tsc --noEmit`, `eslint .`, `vitest run` (15 files, 178 tests), `vite build`.
Not executed: Playwright E2E, axe accessibility scan, real-browser visual or mobile checks, tests against a live Supabase project.
