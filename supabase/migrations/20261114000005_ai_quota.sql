-- Migration 0005: AI generation quota. The Edge Function calls OpenRouter only after this succeeds,
-- so a compromised or careless admin session cannot run up unlimited model cost.

create table public.ai_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  created_at timestamptz not null default now()
);
create index ai_usage_user_time_idx on public.ai_usage (user_id, created_at);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
-- No policies: only consume_ai_quota() touches this table.

create or replace function public.consume_ai_quota()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  hourly_limit constant integer := 30;
  n integer;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can use AI generation.' using errcode = '42501';
  end if;
  -- Serialise per user so concurrent requests cannot both squeeze under the limit.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  delete from public.ai_usage where created_at < now() - interval '1 day';
  select count(*)::int into n from public.ai_usage
   where user_id = auth.uid() and created_at > now() - interval '1 hour';
  if n >= hourly_limit then return false; end if;
  insert into public.ai_usage (user_id) values (auth.uid());
  return true;
end $$;

revoke all on function public.consume_ai_quota() from public, anon;
grant execute on function public.consume_ai_quota() to authenticated;
