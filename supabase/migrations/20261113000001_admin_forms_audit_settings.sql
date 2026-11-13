-- Migration 0001: admin_users, forms, audit_logs, platform_settings
-- Security model: docs/SECURITY.md. RLS enabled on every table; anon has NO access.

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ------------------------------------------------------------ admin_users
create table public.admin_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  role        text not null default 'super_admin' check (role in ('super_admin')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint admin_users_email_lower check (email = lower(email) and length(email) between 3 and 320)
);
create unique index admin_users_email_key on public.admin_users (email);
-- Exactly one Super Admin initially.
create unique index admin_users_single_super_admin on public.admin_users (role) where role = 'super_admin';
create trigger admin_users_set_updated_at before update on public.admin_users
  for each row execute function public.set_updated_at();

-- Server-side authorization primitive. SECURITY DEFINER so it works even though
-- clients cannot read other admin rows; empty search_path prevents hijacking.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_users a
    where a.id = auth.uid() and a.is_active
  );
$$;

-- ------------------------------------------------------------------ forms
create table public.forms (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.admin_users(id) on delete restrict,
  title                 text not null check (length(btrim(title)) between 1 and 200),
  slug                  text not null,
  status                text not null default 'draft' check (status in ('draft','published','archived')),
  draft_schema          jsonb not null check (jsonb_typeof(draft_schema) = 'object'),
  -- FK to form_versions is added in the migration that creates that table (Phase 2).
  published_version_id  uuid,
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint forms_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 64),
  constraint forms_published_has_version check (status <> 'published' or published_version_id is not null),
  constraint forms_archived_has_timestamp check ((status = 'archived') = (archived_at is not null))
);
create unique index forms_slug_key on public.forms (slug);
create index forms_owner_status_idx on public.forms (owner_id, status);
create index forms_status_updated_idx on public.forms (status, updated_at desc);
create trigger forms_set_updated_at before update on public.forms
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------- audit_logs
create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.admin_users(id) on delete restrict,
  action       text not null check (length(action) between 1 and 100),
  entity_type  text check (entity_type is null or length(entity_type) <= 50),
  entity_id    uuid,
  metadata     jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at   timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id);

-- Append-only: no UPDATE/DELETE/TRUNCATE for anyone (including admins and service role).
create or replace function public.audit_logs_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_logs is append-only';
end $$;
create trigger audit_logs_no_update_delete before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.audit_logs_immutable();

-- The only way for the client to write an audit entry. Actor is taken from the
-- JWT, never from the caller.
create or replace function public.log_audit(
  p_action text, p_entity_type text default null, p_entity_id uuid default null, p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end $$;

-- Server-side audit of form lifecycle (cannot be skipped by a client).
create or replace function public.audit_forms_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is not null and not exists (select 1 from public.admin_users where id = actor) then
    actor := null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (actor, 'form.created', 'form', new.id, jsonb_build_object('title', new.title, 'slug', new.slug));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (actor, 'form.status_changed', 'form', new.id, jsonb_build_object('from', old.status, 'to', new.status));
  elsif tg_op = 'DELETE' then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (actor, 'form.deleted', 'form', old.id, jsonb_build_object('title', old.title, 'slug', old.slug));
    return old;
  end if;
  return new;
end $$;
create trigger forms_audit after insert or update or delete on public.forms
  for each row execute function public.audit_forms_changes();

-- ------------------------------------------------------- platform_settings
create table public.platform_settings (
  id          uuid primary key default gen_random_uuid(),
  key         text not null check (key ~ '^[a-z0-9_.]+$' and length(key) <= 100),
  value       jsonb not null,
  updated_by  uuid references public.admin_users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index platform_settings_key_key on public.platform_settings (key);
create trigger platform_settings_set_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();
-- Non-secret defaults only. Secrets live in Edge Function secrets, never here.
insert into public.platform_settings (key, value) values
  ('retention.ai_source_documents_days', '0'::jsonb),
  ('retention.submissions_days', 'null'::jsonb);

-- ------------------------------------------------------------ privileges
-- Default-deny: strip everything, then grant the minimum. RLS is a second layer.
revoke all on public.admin_users, public.forms, public.audit_logs, public.platform_settings from anon, authenticated;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.log_audit(text, text, uuid, jsonb) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.log_audit(text, text, uuid, jsonb) to authenticated;

grant select on public.admin_users to authenticated;                          -- own row only (RLS)
grant select, insert, update, delete on public.forms to authenticated;        -- admin only (RLS)
grant select on public.audit_logs to authenticated;                           -- read-only; writes via log_audit()/triggers
grant select, insert, update on public.platform_settings to authenticated;    -- admin only (RLS)

-- -------------------------------------------------------------------- RLS
alter table public.admin_users       enable row level security;
alter table public.forms             enable row level security;
alter table public.audit_logs        enable row level security;
alter table public.platform_settings enable row level security;

-- admin_users: a signed-in user may read only their own row (needed for the
-- client to learn its authorization state). No client INSERT/UPDATE/DELETE
-- policy exists: admins are provisioned out-of-band (see docs/DATABASE.md).
create policy admin_users_select_self on public.admin_users
  for select to authenticated using (id = auth.uid());

create policy forms_admin_select on public.forms
  for select to authenticated using (public.is_admin());
create policy forms_admin_insert on public.forms
  for insert to authenticated with check (public.is_admin() and owner_id = auth.uid());
create policy forms_admin_update on public.forms
  for update to authenticated using (public.is_admin()) with check (public.is_admin() and owner_id = auth.uid());
create policy forms_admin_delete on public.forms
  for delete to authenticated using (public.is_admin());

create policy audit_logs_admin_select on public.audit_logs
  for select to authenticated using (public.is_admin());

create policy platform_settings_admin_select on public.platform_settings
  for select to authenticated using (public.is_admin());
create policy platform_settings_admin_insert on public.platform_settings
  for insert to authenticated with check (public.is_admin() and updated_by = auth.uid());
create policy platform_settings_admin_update on public.platform_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin() and updated_by = auth.uid());
