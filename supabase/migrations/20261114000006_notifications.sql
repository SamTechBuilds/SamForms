-- Migration 0006: email notifications for new responses.
-- A trigger queues one row per response when a form's notifications are on. The Edge Function
-- `send-notifications` (service role only) claims queued rows and sends them. The queue never
-- contains answers, only identifiers and the recipient address.

create table public.notification_settings (
  form_id    uuid primary key references public.forms(id) on delete cascade,
  enabled    boolean not null default false,
  recipient  text check (recipient is null or (char_length(recipient) <= 320 and recipient ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  updated_at timestamptz not null default now(),
  constraint notification_enabled_needs_recipient check (not enabled or recipient is not null)
);
alter table public.notification_settings enable row level security;
revoke all on public.notification_settings from anon;
grant select, insert, update, delete on public.notification_settings to authenticated;
create policy notification_settings_admin on public.notification_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table public.notification_queue (
  id            bigint generated always as identity primary key,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  recipient     text not null,
  status        text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts      integer not null default 0 check (attempts >= 0),
  last_error    text check (last_error is null or char_length(last_error) <= 500),
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
create index notification_queue_pending_idx on public.notification_queue (created_at) where status = 'pending';
alter table public.notification_queue enable row level security;
revoke all on public.notification_queue from anon, authenticated;

create or replace function public.queue_response_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notification_queue (submission_id, recipient)
  select new.id, s.recipient
    from public.notification_settings s
   where s.form_id = new.form_id and s.enabled and s.recipient is not null;
  return new;
end $$;

create trigger submissions_queue_notification after insert on public.submissions
  for each row execute function public.queue_response_notification();

-- Only the service role (Edge Function) may claim or complete notifications.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

create or replace function public.claim_notifications(p_limit integer default 20)
returns table (id bigint, recipient text, form_title text, form_slug text, form_id uuid, submission_id uuid, submitted_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with picked as (
    select q.id from public.notification_queue q
     where q.status = 'pending' and q.attempts < 5
     order by q.created_at
     limit least(greatest(p_limit, 1), 50)
     for update skip locked
  ), bumped as (
    update public.notification_queue q set attempts = q.attempts + 1
      from picked where q.id = picked.id
    returning q.id, q.recipient, q.submission_id
  )
  select b.id, b.recipient, f.title, f.slug, f.id, b.submission_id, s.submitted_at
    from bumped b
    join public.submissions s on s.id = b.submission_id
    join public.forms f on f.id = s.form_id;
end $$;

create or replace function public.complete_notification(p_id bigint, p_ok boolean, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notification_queue
     set status = case when p_ok then 'sent' else case when attempts >= 5 then 'failed' else 'pending' end end,
         sent_at = case when p_ok then now() else null end,
         last_error = case when p_ok then null else left(p_error, 500) end
   where id = p_id;
end $$;

revoke all on function public.claim_notifications(integer), public.complete_notification(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer), public.complete_notification(bigint, boolean, text) to service_role;
