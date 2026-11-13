# Database (Supabase Postgres) — plan; migrations land with the phase that needs each table
All PKs `uuid default gen_random_uuid()`, `created_at/updated_at timestamptz`, RLS enabled on every table.
| Table | Phase | Key columns | Notes |
|---|---|---|---|
| admin_users | 1 | id (=auth.users.id), email unique, role ('super_admin'), is_active | Allowlist. `is_admin()` SECURITY DEFINER fn checks it. Signup disabled in Supabase Auth. |
| forms | 1–2 | owner_id→admin_users, title, slug unique, status (draft/published/archived), draft_schema jsonb, published_version_id | slug unique + format check |
| form_versions | 2 | form_id, version int, schema jsonb, published_at; unique(form_id,version) | Immutable via trigger |
| submissions | 3 | form_id, form_version_id→form_versions, answers jsonb, submitted_at, ip_hash, user_agent | No public policy; written by edge fn |
| submission_files | 3–4 | submission_id, question_id, storage_path, mime, size_bytes, original_name | Private bucket |
| form_templates | 2 | name, category, schema jsonb, is_system | Read: admin only |
| ai_generation_jobs | 5 | kind (document/prompt), status, input_meta, output jsonb, error, tokens, provider/model | No source doc retained |
| audit_logs | 1 | actor_id, action, entity_type, entity_id, metadata jsonb | Insert via fn/trigger; admin read-only; no update/delete |
| platform_settings | 1 | key unique, value jsonb | e.g. notification email, retention days |
Indexes: forms(owner_id,status), forms(slug), form_versions(form_id,version desc), submissions(form_id,submitted_at desc), submissions(form_version_id), submission_files(submission_id), audit_logs(created_at desc), GIN on submissions.answers only if search needs it.
## RLS summary
- Admin tables: `using (public.is_admin())` for select/insert/update/delete as appropriate.
- Public reads of a published form go through RPC/edge fn returning only `form_versions.schema` for status='published' slug — never table access.
- submissions / submission_files / admin_users / audit_logs: zero anon policies.
## Retention
Respondent files and submissions retained until admin deletes; AI source docs not stored; ai_generation_jobs input_meta only; configurable purge via platform_settings (Phase 6).

## Phase 1 status — migration `20261113000001_admin_forms_audit_settings.sql`
Implemented: admin_users, forms, audit_logs, platform_settings (+ helpers `set_updated_at`, `is_admin()`, `log_audit()`, `audit_forms_changes` trigger).
Decisions beyond the plan:
- `admin_users`: one-super-admin enforced by partial unique index; email must be lowercase. Admins are provisioned **out-of-band** (SETUP.md step 5): there is deliberately no client INSERT/UPDATE/DELETE policy or grant. Clients may read only their own row.
- `forms`: `slug` format/length check; `status` check; `published ⇒ published_version_id not null` and `archived ⇔ archived_at not null` invariants; `draft_schema` must be a JSON object. `published_version_id` has **no FK yet** — Phase 2 adds it with `form_versions`. The full canonical-schema validation of `draft_schema` happens in app code (Zod) and, from Phase 2, in the publish path; the DB only guarantees "JSON object".
- `owner_id → admin_users ON DELETE RESTRICT`; `audit_logs.actor_id → admin_users ON DELETE RESTRICT` (deactivate admins, don't delete them).
- `audit_logs` is append-only (row triggers block UPDATE/DELETE, statement trigger blocks TRUNCATE); clients cannot INSERT directly: only `log_audit()` (actor taken from JWT) and the forms trigger write.
- `platform_settings`: seeded non-secret defaults `retention.ai_source_documents_days=0`, `retention.submissions_days=null`. No DELETE grant.
- Privileges: `anon` has no table or function privileges; `authenticated` gets the minimum, RLS on top.
