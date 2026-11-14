-- Migration 0004: response management for administrators.
-- Statistics (read-only aggregates) and deletion of a single response with its files queued for
-- storage cleanup. Responses stay immutable: deletion is the only write. Everything here is admin-only.

create table public.storage_cleanup (
  storage_path text primary key check (char_length(storage_path) between 1 and 512),
  queued_at    timestamptz not null default now()
);
alter table public.storage_cleanup enable row level security;
revoke all on public.storage_cleanup from anon, authenticated;
-- No policies: only the security definer functions below touch this table.

create or replace function public.response_stats(p_form_id uuid, p_tz text default 'UTC')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  tz       text := coalesce(nullif(p_tz, ''), 'UTC');
  sch      jsonb;
  q        jsonb;
  qid      text;
  qtype    text;
  dist     jsonb;
  nums     record;
  answered integer;
  qs       jsonb := '[]'::jsonb;
  total_n  integer;
  days     jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can view responses.' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_timezone_names where name = tz) then
    raise exception 'Unknown time zone.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.forms f where f.id = p_form_id) then
    raise exception 'Form not found.' using errcode = 'P0002';
  end if;

  -- Question list comes from the newest version; responses on older versions still count by question id.
  select v.schema into sch from public.form_versions v
   where v.form_id = p_form_id order by v.version desc limit 1;

  select count(*)::int into total_n from public.submissions s where s.form_id = p_form_id;

  -- Last 30 calendar days in the caller's time zone, oldest first, zero-filled.
  select coalesce(jsonb_agg(jsonb_build_object('day', to_char(d.day::date, 'YYYY-MM-DD'), 'count', coalesce(c.n, 0))
                            order by d.day), '[]'::jsonb)
    into days
    from generate_series((now() at time zone tz)::date - 29, (now() at time zone tz)::date, interval '1 day') as d(day)
    left join (select (s.submitted_at at time zone tz)::date as day, count(*)::int as n
                 from public.submissions s
                where s.form_id = p_form_id and s.submitted_at >= now() - interval '31 days'
                group by 1) c on c.day = d.day::date;

  for q in select value from jsonb_array_elements(coalesce(sch->'questions', '[]'::jsonb)) as x(value) loop
    qid := q->>'id';
    qtype := q->>'type';
    continue when qtype in ('heading', 'description', 'image', 'divider');

    select count(*)::int into answered from public.submissions s
     where s.form_id = p_form_id and public.sf_answered(s.answers -> qid);

    dist := null;
    if qtype in ('single_choice', 'dropdown', 'yes_no') then
      select coalesce(jsonb_agg(jsonb_build_object('value', b.v, 'count', b.n) order by b.n desc, b.v), '[]'::jsonb)
        into dist
        from (select (s.answers ->> qid) as v, count(*)::int as n
                from public.submissions s
               where s.form_id = p_form_id and jsonb_typeof(s.answers -> qid) in ('string', 'boolean')
               group by 1) b;
    elsif qtype = 'multiple_choice' then
      select coalesce(jsonb_agg(jsonb_build_object('value', b.v, 'count', b.n) order by b.n desc, b.v), '[]'::jsonb)
        into dist
        from (select e.v as v, count(*)::int as n
                from public.submissions s
                cross join lateral jsonb_array_elements_text(
                       case when jsonb_typeof(s.answers -> qid) = 'array' then s.answers -> qid else '[]'::jsonb end) as e(v)
               where s.form_id = p_form_id
               group by 1) b;
    elsif qtype in ('number', 'currency', 'star_rating', 'linear_scale', 'opinion_scale') then
      select count(*)::int as n,
             round(avg((s.answers ->> qid)::numeric), 2) as a,
             min((s.answers ->> qid)::numeric) as lo,
             max((s.answers ->> qid)::numeric) as hi
        into nums
        from public.submissions s
       where s.form_id = p_form_id and jsonb_typeof(s.answers -> qid) = 'number';
      dist := jsonb_build_object('count', nums.n, 'average', nums.a, 'min', nums.lo, 'max', nums.hi);
    end if;

    qs := qs || jsonb_build_array(jsonb_build_object(
      'id', qid, 'label', coalesce(q->>'label', qid), 'type', qtype,
      'answered', answered, 'breakdown', dist));
  end loop;

  return jsonb_build_object(
    'total', total_n,
    'last_7_days', (select count(*)::int from public.submissions s
                     where s.form_id = p_form_id and s.submitted_at >= now() - interval '7 days'),
    'last_30_days', (select count(*)::int from public.submissions s
                      where s.form_id = p_form_id and s.submitted_at >= now() - interval '30 days'),
    'per_day', days,
    'questions', qs);
end $$;

-- Deletes one response. Its files are queued for storage removal in the same transaction, so a
-- failed storage call never leaves an untracked object behind.
create or replace function public.delete_submission(p_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  paths text[];
begin
  if not public.is_admin() then
    raise exception 'Only administrators can delete responses.' using errcode = '42501';
  end if;
  select coalesce(array_agg(f.storage_path), '{}'::text[]) into paths
    from public.submission_files f where f.submission_id = p_id;
  delete from public.submissions where id = p_id;
  if not found then
    raise exception 'Response not found.' using errcode = 'P0002';
  end if;
  insert into public.storage_cleanup (storage_path)
  select unnest(paths) on conflict (storage_path) do nothing;
  return paths;
end $$;

-- Called by the admin client after the storage objects are removed.
create or replace function public.finish_storage_cleanup(p_paths text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can clean up storage.' using errcode = '42501';
  end if;
  delete from public.storage_cleanup where storage_path = any(p_paths);
  get diagnostics n = row_count;
  return n;
end $$;

-- Admins may remove objects from the private bucket (uploads from respondents are otherwise insert-only).
do $$
begin
  if to_regnamespace('storage') is not null then
    execute 'drop policy if exists sf_submissions_admin_delete on storage.objects';
    execute $p$create policy sf_submissions_admin_delete on storage.objects for delete to authenticated
      using (bucket_id = 'submissions' and public.is_admin())$p$;
  end if;
end $$;

revoke all on function public.response_stats(uuid, text), public.delete_submission(uuid), public.finish_storage_cleanup(text[])
  from public, anon;
grant execute on function public.response_stats(uuid, text), public.delete_submission(uuid), public.finish_storage_cleanup(text[])
  to authenticated;
