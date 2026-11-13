# Test Plan
Tools: Vitest (unit), Supabase local + SQL/pgTAP-style RLS tests (integration), Playwright (E2E, mobile viewports), tsc, ESLint.
| Area | Level | Phase |
|---|---|---|
| Schema validity/defaults/cross-refs, malformed AI output | unit | 0 ✅ |
| Condition engine (all operators, AND/OR) | unit | 0 ✅ |
| Auth guard/provider/login UI (mocked Supabase), RLS + constraints for 0001 tables (PGlite) | unit+integration | 1 ✅ |
| Auth against a real Supabase project, RLS on later tables | integration | 1 (pending credentials) / 2+ |
| Builder CRUD/reorder/duplicate/type change, autosave | unit+E2E | 2 |
| Publish immutability & versioning | integration | 2 |
| Public access, conditional display, server validation, uploads, rate limit | integration+E2E | 3 |
| Response privacy, exports (incl. formula-injection escaping) | integration | 4 |
| Extractors, import failures, AI success/failure/malformed | unit+integration (mocked provider) | 5 |
| Mobile layout, a11y (axe), full flow | E2E | 6 |
