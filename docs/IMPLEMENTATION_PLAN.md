# Implementation Plan
- **P0 Foundation** ✅ docs, canonical schema, condition engine, tests.
- **P1 Auth+Dashboard** ✅ (code + tests done; needs your Supabase project to run live, see SETUP.md): Vite/React/Tailwind/shadcn scaffold, Supabase project + migrations (admin_users, forms, audit_logs, platform_settings), login/logout/recovery, guards, `is_admin()`, dashboard stats, forms list shell, RLS tests.
- **P2 Builder:** form_versions + form_templates migrations, field registry, canvas/settings/preview, dnd-kit, sections/page breaks, themes, autosave, publish/duplicate/archive.
- **P3 Public:** `submit-form` fn, submissions + files migrations, conversational + classic renderer, conditions, server validation, rate limit.
- **P4 Responses:** list/filter/search/sort, detail, signed file URLs, CSV/XLSX export, basic analytics.
- **P5 AI:** extractors (Mammoth, PDF.js, SheetJS, Papa), manual import UI, provider adapter, doc→form, prompt→form, review screen, ai_generation_jobs.
- **P6 Finalize:** email notifications, security review, perf, a11y, Playwright E2E, deploy docs.
