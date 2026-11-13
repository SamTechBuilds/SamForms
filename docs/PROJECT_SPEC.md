# Sam Forms — Project Spec
Owner: Sam Tech Builds. Private form-builder + response-management platform (Tally/Typeform/Google Forms inspired). One Super Admin; public respondents need no account; no public registration. Independent repo + Supabase project; touches no other project.

## Scope (see master instructions §5)
Auth · Dashboard · 4 creation methods (scratch, manual import, AI doc→form, AI prompt→form) all emitting ONE canonical schema · Builder (dnd-kit, registry-driven) · Public renderer (conversational + classic) · Conditional logic · Themes · Responses + CSV/XLSX export · Lifecycle (draft/published/archived, immutable versions) · Notifications.

## Non-goals (initial)
Public accounts, OCR for scanned PDFs (planned later), team roles beyond Super Admin, payments.

## Definition of done per phase
Features work end-to-end, migrations + RLS + tests ship together, typecheck/lint/tests actually executed and recorded in STATE.md.
