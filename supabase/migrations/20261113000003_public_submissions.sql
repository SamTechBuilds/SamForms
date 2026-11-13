-- Migration 0003: public form access, server-side submission validation, rate limiting,
-- private file uploads. Anonymous respondents never touch tables directly: every public
-- operation is a SECURITY DEFINER function with a narrow contract (see docs/SECURITY.md).

-- ---------------------------------------------------------------- helpers
-- Structural answer checks: text checks are whitespace-trimmed like the Zod schemas.
-- Mirrors src/schema/conditions.ts and src/fields/definitions.ts; parity is tested in
-- tests/db/validate-parity.test.ts. Keep the two in step when either changes.

create or replace function public.sf_answered(v jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select v is not null
     and jsonb_typeof(v) <> 'null'
     and not (jsonb_typeof(v) = 'string' and v #>> '{}' = '')
     and not (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0);
$$;

create or replace function public.sf_eval_condition(c jsonb, answers jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  a   jsonb := answers -> (c->>'questionId');
  val jsonb := c -> 'value';
  op  text  := c->>'operator';
  r   boolean := false;
begin
  if op = 'is_answered' then r := public.sf_answered(a);
  elsif op = 'is_empty' then r := not public.sf_answered(a);
  elsif op = 'equals' then
    if jsonb_typeof(a) = 'array' then r := exists (select 1 from jsonb_array_elements(a) e where e = val);
    else r := coalesce(a = val, false); end if;
  elsif op = 'not_equals' then
    if jsonb_typeof(a) = 'array' then r := not exists (select 1 from jsonb_array_elements(a) e where e = val);
    else r := not coalesce(a = val, false); end if;
  elsif op = 'contains' then
    if jsonb_typeof(a) = 'array' then r := exists (select 1 from jsonb_array_elements(a) e where e = val);
    elsif jsonb_typeof(a) = 'string' and jsonb_typeof(val) = 'string' then
      r := strpos(lower(a #>> '{}'), lower(val #>> '{}')) > 0;
    end if;
  elsif op = 'greater_than' then
    if jsonb_typeof(a) = 'number' and jsonb_typeof(val) = 'number' then
      r := (a #>> '{}')::numeric > (val #>> '{}')::numeric;
    end if;
  elsif op = 'less_than' then
    if jsonb_typeof(a) = 'number' and jsonb_typeof(val) = 'number' then
      r := (a #>> '{}')::numeric < (val #>> '{}')::numeric;
    end if;
  end if;
  return r;
end $$;

create or replace function public.sf_eval_rule(r jsonb, answers jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case when r->>'combinator' = 'or' then
    exists (select 1 from jsonb_array_elements(coalesce(r->'conditions', '[]'::jsonb)) c
            where public.sf_eval_condition(c, answers))
  else
    not exists (select 1 from jsonb_array_elements(coalesce(r->'conditions', '[]'::jsonb)) c
                where not public.sf_eval_condition(c, answers))
  end;
$$;

-- Show rules: at least one must pass (if any exist). Hide rules: none may pass.
create or replace function public.sf_is_visible(q jsonb, answers jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select not exists (
           select 1 from jsonb_array_elements(coalesce(q->'rules', '[]'::jsonb)) r
           where r->'action'->>'type' = 'hide' and public.sf_eval_rule(r, answers))
     and (
           not exists (select 1 from jsonb_array_elements(coalesce(q->'rules', '[]'::jsonb)) r
                       where r->'action'->>'type' = 'show')
        or exists (select 1 from jsonb_array_elements(coalesce(q->'rules', '[]'::jsonb)) r
                   where r->'action'->>'type' = 'show' and public.sf_eval_rule(r, answers)));
$$;

-- Same fixed-point iteration as effectiveAnswers() in src/features/renderer/logic.ts.
create or replace function public.sf_effective_answers(p_questions jsonb, answers jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  cur jsonb := answers;
  nxt jsonb;
  q   jsonb;
  i   int;
begin
  for i in 1..5 loop
    nxt := '{}'::jsonb;
    for q in select value from jsonb_array_elements(p_questions) as t(value) loop
      if cur ? (q->>'id') and public.sf_is_visible(q, cur) then
        nxt := nxt || jsonb_build_object(q->>'id', cur -> (q->>'id'));
      end if;
    end loop;
    if nxt = cur then return cur; end if;
    cur := nxt;
  end loop;
  return cur;
end $$;

create or replace function public.sf_is_iso_date(s text)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if s is null or s !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  return to_char(s::date, 'YYYY-MM-DD') = s;
exception when others then
  return false;
end $$;

-- A pattern that fails to compile is ignored (true), matching the client, which flags it at publish time.
create or replace function public.sf_pattern_passes(s text, pat text)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  return s ~ pat;
exception when others then
  return true;
end $$;

create or replace function public.sf_validate_answer(q jsonb, v jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  t    text    := q->>'type';
  cfg  jsonb   := coalesce(q->'config', '{}'::jsonb);
  val  jsonb   := coalesce(q->'validation', '{}'::jsonb);
  req  boolean := coalesce((q->>'required')::boolean, false);
  opts jsonb   := coalesce(q->'options', '[]'::jsonb);
  s    text;
  n    numeric;
  lo   numeric;
  hi   numeric;
  i    jsonb;
  seen text[] := '{}';
  maxlen int;
begin
  if t in ('heading', 'description', 'image', 'divider') then return null; end if;

  if not public.sf_answered(v) or (t = 'toggle' and req and v is distinct from 'true'::jsonb) then
    if req then return 'This question is required'; end if;
    return null;
  end if;

  if t in ('short_text', 'long_text') then
    if jsonb_typeof(v) <> 'string' then return 'Enter your answer as text'; end if;
    s := btrim(v #>> '{}');
    maxlen := case when t = 'short_text' then 1000 else 10000 end;
    if char_length(s) > maxlen then return format('Must be at most %s characters', maxlen); end if;
    if val ? 'minLength' and char_length(s) < (val->>'minLength')::int then
      return format('Must be at least %s characters', val->>'minLength');
    end if;
    if val ? 'maxLength' and char_length(s) > (val->>'maxLength')::int then
      return format('Must be at most %s characters', val->>'maxLength');
    end if;
    if coalesce(val->>'pattern', '') <> '' and not public.sf_pattern_passes(left(s, 5000), val->>'pattern') then
      return coalesce(val->>'patternMessage', 'Invalid format');
    end if;
    return null;
  end if;

  if t = 'name' then
    if coalesce(cfg->>'format', 'full') = 'first_last' then
      if jsonb_typeof(v) <> 'object' then return 'Enter a name'; end if;
      if jsonb_typeof(v->'first') is distinct from 'string' or char_length(btrim(v->>'first')) not between 1 and 100 then
        return 'Enter a first name';
      end if;
      if jsonb_typeof(v->'last') is distinct from 'string' or char_length(btrim(v->>'last')) not between 1 and 100 then
        return 'Enter a last name';
      end if;
      return null;
    end if;
    if jsonb_typeof(v) <> 'string' then return 'Enter a name'; end if;
    s := btrim(v #>> '{}');
    if char_length(s) not between 1 and 200 then return 'Enter a name'; end if;
    return null;
  end if;

  if t = 'email' then
    if jsonb_typeof(v) <> 'string' then return 'Enter a valid email address'; end if;
    s := btrim(v #>> '{}');
    if char_length(s) > 320 or s !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return 'Enter a valid email address'; end if;
    return null;
  end if;

  if t = 'phone' then
    if jsonb_typeof(v) <> 'string' then return 'Enter a valid phone number'; end if;
    s := btrim(v #>> '{}');
    if s !~ '^\+?[0-9 ().-]{7,24}$' or length(regexp_replace(s, '[^0-9]', '', 'g')) not between 7 and 15 then
      return 'Enter a valid phone number';
    end if;
    return null;
  end if;

  if t = 'url' then
    if jsonb_typeof(v) <> 'string' then return 'Enter a valid URL starting with http:// or https://'; end if;
    s := btrim(v #>> '{}');
    if char_length(s) > 2000 or s !~* '^https?://[^\s/?#]+\S*$' then
      return 'Enter a valid URL starting with http:// or https://';
    end if;
    return null;
  end if;

  if t in ('number', 'currency') then
    if jsonb_typeof(v) <> 'number' then return 'Enter a number'; end if;
    n := (v #>> '{}')::numeric;
    if t = 'number' and coalesce((cfg->>'allowDecimals')::boolean, true) = false and n <> trunc(n) then
      return 'Enter a whole number';
    end if;
    if val ? 'min' and n < (val->>'min')::numeric then return format('Must be at least %s', val->>'min'); end if;
    if val ? 'max' and n > (val->>'max')::numeric then return format('Must be at most %s', val->>'max'); end if;
    if t = 'currency' and abs(round(n * 100) - n * 100) >= 0.000001 then return 'Use at most 2 decimal places'; end if;
    return null;
  end if;

  if t in ('single_choice', 'dropdown') then
    if jsonb_typeof(v) <> 'string' then return 'Choose one of the options'; end if;
    s := v #>> '{}';
    if char_length(s) > 200 then return 'Choose one of the options'; end if;
    if t = 'single_choice' and coalesce((cfg->>'allowOther')::boolean, false) then return null; end if;
    if not exists (select 1 from jsonb_array_elements(opts) o where o->>'value' = s) then
      return 'Choose one of the options';
    end if;
    return null;
  end if;

  if t = 'multiple_choice' then
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 200 then return 'Choose from the options'; end if;
    for i in select value from jsonb_array_elements(v) as t(value) loop
      if jsonb_typeof(i) <> 'string' or char_length(i #>> '{}') > 200 then return 'Choose from the options'; end if;
      if not coalesce((cfg->>'allowOther')::boolean, false)
         and not exists (select 1 from jsonb_array_elements(opts) o where o->>'value' = i #>> '{}') then
        return 'Choose from the options';
      end if;
      if (i #>> '{}') = any(seen) then return 'Each option can be chosen once'; end if;
      seen := seen || (i #>> '{}');
    end loop;
    if val ? 'minSelections' and jsonb_array_length(v) < (val->>'minSelections')::int then
      return format('Choose at least %s', val->>'minSelections');
    end if;
    if val ? 'maxSelections' and jsonb_array_length(v) > (val->>'maxSelections')::int then
      return format('Choose at most %s', val->>'maxSelections');
    end if;
    return null;
  end if;

  if t = 'yes_no' then
    if jsonb_typeof(v) <> 'boolean' then return 'Choose yes or no'; end if;
    return null;
  end if;
  if t = 'toggle' then
    if jsonb_typeof(v) <> 'boolean' then return 'Invalid answer'; end if;
    return null;
  end if;

  if t = 'date' then
    if jsonb_typeof(v) <> 'string' or not public.sf_is_iso_date(v #>> '{}') then return 'Enter a valid date'; end if;
    s := v #>> '{}';
    if cfg ? 'minDate' and s < (cfg->>'minDate') then return format('Choose a date on or after %s', cfg->>'minDate'); end if;
    if cfg ? 'maxDate' and s > (cfg->>'maxDate') then return format('Choose a date on or before %s', cfg->>'maxDate'); end if;
    return null;
  end if;

  if t = 'time' then
    if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return 'Enter a valid time';
    end if;
    return null;
  end if;

  if t = 'date_range' then
    if jsonb_typeof(v) <> 'object'
       or jsonb_typeof(v->'start') <> 'string' or jsonb_typeof(v->'end') <> 'string'
       or not public.sf_is_iso_date(v->>'start') or not public.sf_is_iso_date(v->>'end') then
      return 'Enter a valid date range';
    end if;
    if (v->>'end') < (v->>'start') then return 'End date must be on or after the start date'; end if;
    return null;
  end if;

  if t in ('star_rating', 'linear_scale', 'opinion_scale') then
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) then
      return 'Choose a value from the scale';
    end if;
    n := (v #>> '{}')::numeric;
    if t = 'star_rating' then
      lo := 1; hi := coalesce((cfg->>'max')::numeric, 5);
    elsif t = 'linear_scale' then
      lo := coalesce((cfg->>'min')::numeric, 1); hi := coalesce((cfg->>'max')::numeric, 5);
    else
      lo := coalesce((cfg->>'start')::numeric, 0); hi := coalesce((cfg->>'end')::numeric, 10);
    end if;
    if n < lo or n > hi then return format('Choose a value from %s to %s', lo, hi); end if;
    return null;
  end if;

  -- Files: count here; each file is checked against its pending upload in validate_submission().
  if t in ('file_upload', 'image_upload') then
    if jsonb_typeof(v) <> 'array'
       or jsonb_array_length(v) > coalesce((val->>'maxFiles')::int, 1) then
      return format('Upload at most %s file(s)', coalesce(val->>'maxFiles', '1'));
    end if;
    return null;
  end if;

  if t = 'signature' then
    if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 300000 then return 'Signature image is too large'; end if;
    if not ((v #>> '{}') ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$') then return 'Please sign in the box'; end if;
    return null;
  end if;

  if t = 'color_picker' then
    if jsonb_typeof(v) <> 'string' or not ((v #>> '{}') ~ '^#[0-9a-fA-F]{6}$') then return 'Choose a valid colour'; end if;
    return null;
  end if;

  return 'Unsupported field type';
end $$;

-- ------------------------------------------------------------ tables
create table public.pending_uploads (
  id             uuid primary key default gen_random_uuid(),
  form_id        uuid not null references public.forms(id) on delete cascade,
  question_id    text not null check (question_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  storage_path   text not null unique check (char_length(storage_path) between 1 and 512),
  mime_type      text not null check (char_length(mime_type) between 3 and 200),
  size_bytes     bigint not null check (size_bytes > 0),
  original_name  text not null check (char_length(original_name) between 1 and 255),
  ip_hash        text check (ip_hash is null or char_length(ip_hash) = 64),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  consumed_at    timestamptz
);
create index pending_uploads_form_idx on public.pending_uploads (form_id);
create index pending_uploads_expiry_idx on public.pending_uploads (expires_at) where consumed_at is null;

create table public.submissions (
  id              uuid primary key default gen_random_uuid(),
  form_id         uuid not null,
  form_version_id uuid not null,
  answers         jsonb not null check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 500000),
  submitted_at    timestamptz not null default now(),
  ip_hash         text check (ip_hash is null or char_length(ip_hash) = 64),
  user_agent      text check (user_agent is null or char_length(user_agent) <= 300),
  constraint submissions_form_fk foreign key (form_id) references public.forms(id) on delete restrict,
  -- a submission is pinned to the exact version the respondent saw
  constraint submissions_version_fk foreign key (form_id, form_version_id) references public.form_versions(form_id, id) on delete restrict
);
create index submissions_form_time_idx on public.submissions (form_id, submitted_at desc);
create index submissions_version_idx on public.submissions (form_version_id);

create or replace function public.submissions_no_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'submissions cannot be edited';
end $$;
create trigger submissions_immutable before update on public.submissions
  for each row execute function public.submissions_no_update();

create table public.submission_files (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references public.submissions(id) on delete cascade,
  question_id    text not null,
  storage_path   text not null unique,
  mime_type      text not null,
  size_bytes     bigint not null check (size_bytes > 0),
  original_name  text not null,
  created_at     timestamptz not null default now()
);
create index submission_files_submission_idx on public.submission_files (submission_id);

-- Fixed-window counters. No client access at all; only consume_rate_limit() touches it.
create table public.rate_limit_events (
  bucket_key    text not null check (char_length(bucket_key) <= 200),
  window_start  timestamptz not null,
  hits          integer not null default 0 check (hits >= 0),
  primary key (bucket_key, window_start)
);

create or replace function public.consume_rate_limit(p_key text, p_max integer, p_window interval)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := date_bin(p_window, now(), timestamptz '2000-01-01 00:00:00+00');
  h integer;
begin
  insert into public.rate_limit_events (bucket_key, window_start, hits) values (p_key, w, 1)
  on conflict (bucket_key, window_start) do update set hits = public.rate_limit_events.hits + 1
  returning hits into h;
  if random() < 0.01 then
    delete from public.rate_limit_events where window_start < now() - interval '1 day';
  end if;
  return h <= p_max;
end $$;

-- Hash of the caller's network address scoped to the form; the raw IP is never stored.
create or replace function public.sf_caller_hash(p_form_id uuid)
returns text language plpgsql stable set search_path = '' as $$
declare
  hdrs text := coalesce(nullif(current_setting('request.headers', true), ''), '{}');
  ip   text := coalesce(nullif(btrim(split_part(coalesce((hdrs::json)->>'x-forwarded-for', ''), ',', 1)), ''), 'unknown');
begin
  return encode(sha256(convert_to(p_form_id::text || ':' || ip, 'UTF8')), 'hex');
end $$;

-- ------------------------------------------------- validation of a submission
-- Returns {"errors": {questionId: message}, "effective": {...}, "files": [pendingUploadId, ...]}.
-- Visibility and answer checks run against the submitted answers (as the renderer does);
-- only visible answers are kept.
create or replace function public.validate_submission(p_form_id uuid, p_schema jsonb, p_answers jsonb)
returns jsonb language plpgsql volatile set search_path = '' as $$
declare
  qlist    jsonb := coalesce(p_schema->'questions', '[]'::jsonb);
  errs     jsonb := '{}'::jsonb;
  file_ids jsonb := '[]'::jsonb;
  fmeta    jsonb := '{}'::jsonb;
  farr     jsonb;
  q        jsonb;
  qid      text;
  k        text;
  msg      text;
  f        jsonb;
  pu       public.pending_uploads%rowtype;
  maxb     bigint;
  sz       bigint;
  mt       text;
  seen     text[];
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    return jsonb_build_object('errors', jsonb_build_object('_form', 'Invalid submission'),
                              'effective', '{}'::jsonb, 'files', '[]'::jsonb);
  end if;

  -- Unknown answer keys are rejected so nothing unexpected is stored.
  for k in select key from jsonb_object_keys(p_answers) as t(key) loop
    if not exists (select 1 from jsonb_array_elements(qlist) x where x->>'id' = k) then
      errs := errs || jsonb_build_object(k, 'Unknown question');
    end if;
  end loop;

  for q in select value from jsonb_array_elements(qlist) as t(value) loop
    qid := q->>'id';
    if q->>'type' in ('heading', 'description', 'image', 'divider') then continue; end if;
    if not public.sf_is_visible(q, p_answers) then continue; end if;

    msg := public.sf_validate_answer(q, p_answers -> qid);
    if msg is not null then
      errs := errs || jsonb_build_object(qid, msg);
      continue;
    end if;

    if q->>'type' in ('file_upload', 'image_upload') and public.sf_answered(p_answers -> qid) then
      seen := '{}';
      maxb := (coalesce((q->'validation'->>'maxFileSizeMb')::numeric, 10) * 1048576)::bigint;
      msg := null;
      farr := '[]'::jsonb;
      for f in select value from jsonb_array_elements(p_answers -> qid) as t(value) loop
        if jsonb_typeof(f->'id') <> 'string' or (f->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          msg := 'The file could not be read. Upload it again.'; exit;
        end if;
        if (f->>'id') = any(seen) then msg := 'Each file can only be attached once.'; exit; end if;
        seen := seen || (f->>'id');

        select * into pu from public.pending_uploads p where p.id = (f->>'id')::uuid;
        if not found or pu.form_id <> p_form_id or pu.question_id <> qid
           or pu.consumed_at is not null or pu.expires_at <= now() then
          msg := 'This file has expired or was already submitted. Upload it again.'; exit;
        end if;
        if pu.size_bytes > maxb then
          msg := format('%s is larger than %s MB.', pu.original_name, coalesce(q->'validation'->>'maxFileSizeMb', '10'));
          exit;
        end if;
        if q->'validation' ? 'allowedMimeTypes' and jsonb_array_length(q->'validation'->'allowedMimeTypes') > 0
           and not exists (select 1 from jsonb_array_elements_text(q->'validation'->'allowedMimeTypes') m where m = pu.mime_type) then
          msg := format('%s is not an allowed file type.', pu.original_name); exit;
        end if;
        if q->>'type' = 'image_upload' and pu.mime_type not like 'image/%' then
          msg := format('%s is not an image.', pu.original_name); exit;
        end if;

        -- When Supabase Storage is present, the uploaded object must exist and match what was requested.
        if to_regnamespace('storage') is not null then
          execute format('select (metadata->>''size'')::bigint, lower(metadata->>''mimetype'') from storage.objects where bucket_id = %L and name = %L',
                         'submissions', pu.storage_path) into sz, mt;
          if sz is null then msg := 'The file was not received. Upload it again.'; exit; end if;
          if sz <> pu.size_bytes or coalesce(mt, '') <> pu.mime_type then
            msg := 'The uploaded file does not match what was requested.'; exit;
          end if;
        end if;

        file_ids := file_ids || to_jsonb(pu.id::text);
        -- Stored metadata comes from the server-side reservation, never from the client payload.
        farr := farr || jsonb_build_array(jsonb_build_object(
          'id', pu.id, 'name', pu.original_name, 'size', pu.size_bytes, 'type', pu.mime_type));
      end loop;
      if msg is not null then errs := errs || jsonb_build_object(qid, msg); end if;
      fmeta := fmeta || jsonb_build_object(qid, farr);
    end if;
  end loop;

  if errs <> '{}'::jsonb then
    return jsonb_build_object('errors', errs, 'effective', '{}'::jsonb, 'files', '[]'::jsonb);
  end if;
  return jsonb_build_object('errors', '{}'::jsonb,
                            'effective', public.sf_effective_answers(qlist, p_answers) || fmeta,
                            'files', file_ids);
end $$;

-- ------------------------------------------------------- public operations
-- Public form definition for respondents. Only published versions; internal review notes removed.
create or replace function public.get_public_form(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'slug', f.slug,
    'title', v.title,
    'schema', jsonb_set(
      v.schema, '{questions}',
      coalesce((select jsonb_agg((q - 'aiNotes') order by ord)
                from jsonb_array_elements(coalesce(v.schema->'questions', '[]'::jsonb)) with ordinality as t(q, ord)),
               '[]'::jsonb)))
  from public.forms f
  join public.form_versions v on v.id = f.published_version_id
  where f.slug = p_slug and f.status = 'published';
$$;

-- Reserve an upload slot for one file on one question. The client then uploads to the returned path.
create or replace function public.request_upload(p_slug text, p_question_id text, p_name text, p_mime text, p_size bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f_id    uuid;
  sch     jsonb;
  q       jsonb;
  qv      jsonb;
  mime    text := lower(btrim(coalesce(p_mime, '')));
  maxb    bigint;
  safe    text;
  uid     uuid := gen_random_uuid();
  path    text;
  exp     timestamptz := now() + interval '1 hour';
  denied  constant text[] := array['text/html', 'application/xhtml+xml', 'image/svg+xml', 'application/javascript',
                                   'text/javascript', 'application/x-javascript', 'text/xml', 'application/xml',
                                   'application/x-msdownload', 'application/x-sh', 'application/x-httpd-php'];
begin
  select f.id, v.schema into f_id, sch
    from public.forms f join public.form_versions v on v.id = f.published_version_id
   where f.slug = p_slug and f.status = 'published';
  if not found then raise exception 'This form is not accepting responses.' using errcode = 'P0002'; end if;

  if not public.consume_rate_limit('upload:' || public.sf_caller_hash(f_id), 60, interval '10 minutes') then
    raise exception 'Too many uploads. Please try again in a few minutes.' using errcode = 'P0429';
  end if;

  select value into q from jsonb_array_elements(coalesce(sch->'questions', '[]'::jsonb)) as t(value)
   where value->>'id' = p_question_id limit 1;
  if q is null or q->>'type' not in ('file_upload', 'image_upload') then
    raise exception 'This question does not accept files.' using errcode = '22023';
  end if;
  qv := coalesce(q->'validation', '{}'::jsonb);

  if mime = '' or char_length(mime) > 200 or mime !~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$' or mime = any(denied) then
    raise exception 'This file type is not allowed.' using errcode = '22023';
  end if;
  if qv ? 'allowedMimeTypes' and jsonb_array_length(qv->'allowedMimeTypes') > 0
     and not exists (select 1 from jsonb_array_elements_text(qv->'allowedMimeTypes') m where m = mime) then
    raise exception 'This file type is not allowed for this question.' using errcode = '22023';
  end if;
  if q->>'type' = 'image_upload' and mime not like 'image/%' then
    raise exception 'Only image files can be uploaded here.' using errcode = '22023';
  end if;

  maxb := (coalesce((qv->>'maxFileSizeMb')::numeric, 10) * 1048576)::bigint;
  if p_size is null or p_size <= 0 or p_size > maxb then
    raise exception 'File is too large (maximum % MB).', coalesce(qv->>'maxFileSizeMb', '10') using errcode = '22023';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'The file needs a name.' using errcode = '22023';
  end if;
  safe := left(regexp_replace(regexp_replace(btrim(coalesce(p_name, '')), '[^A-Za-z0-9._-]+', '_', 'g'), '^\.+', ''), 100);
  if safe = '' then safe := 'file'; end if;
  path := f_id::text || '/' || uid::text || '/' || safe;

  insert into public.pending_uploads (id, form_id, question_id, storage_path, mime_type, size_bytes, original_name, ip_hash, expires_at)
  values (uid, f_id, p_question_id, path, mime, p_size, left(btrim(coalesce(p_name, '')), 255), public.sf_caller_hash(f_id), exp);

  return jsonb_build_object('upload_id', uid, 'path', path, 'expires_at', exp);
end $$;

-- Storage RLS asks this before accepting an object: the path must be a live, unused reservation.
create or replace function public.pending_upload_is_valid(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pending_uploads p
                 where p.storage_path = p_path and p.consumed_at is null and p.expires_at > now());
$$;

-- The one way to submit. Rate-limited per network and form, validated against the pinned
-- published version, files verified and consumed atomically with the submission row.
create or replace function public.submit_response(p_slug text, p_answers jsonb, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f_id   uuid;
  v_id   uuid;
  sch    jsonb;
  res    jsonb;
  sub_id uuid;
  n      integer;
  iph    text;
  ua     text := left(nullif(btrim(coalesce(p_user_agent, '')), ''), 300);
begin
  if p_answers is null or octet_length(p_answers::text) > 500000 then
    raise exception 'The submission is too large.' using errcode = '22001';
  end if;

  select f.id, v.id, v.schema into f_id, v_id, sch
    from public.forms f join public.form_versions v on v.id = f.published_version_id
   where f.slug = p_slug and f.status = 'published';
  if not found then raise exception 'This form is not accepting responses.' using errcode = 'P0002'; end if;

  iph := public.sf_caller_hash(f_id);
  if not public.consume_rate_limit('submit:' || iph, 10, interval '10 minutes') then
    raise exception 'Too many submissions from your network. Please try again in a few minutes.' using errcode = 'P0429';
  end if;

  res := public.validate_submission(f_id, sch, p_answers);
  if res->'errors' <> '{}'::jsonb then
    return jsonb_build_object('ok', false, 'errors', res->'errors');
  end if;

  insert into public.submissions (form_id, form_version_id, answers, ip_hash, user_agent)
  values (f_id, v_id, res->'effective', iph, ua)
  returning id into sub_id;

  -- Consume the uploads atomically; a concurrent submission that already took one makes this fail and roll back.
  with c as (
    update public.pending_uploads p set consumed_at = now()
     where p.form_id = f_id and p.consumed_at is null and p.expires_at > now()
       and p.id in (select (value #>> '{}')::uuid from jsonb_array_elements(res->'files') as t(value))
    returning p.question_id, p.storage_path, p.mime_type, p.size_bytes, p.original_name
  )
  insert into public.submission_files (submission_id, question_id, storage_path, mime_type, size_bytes, original_name)
  select sub_id, c.question_id, c.storage_path, c.mime_type, c.size_bytes, c.original_name from c;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(res->'files') then
    raise exception 'Some files were already submitted or have expired. Please upload them again.' using errcode = '22023';
  end if;

  return jsonb_build_object('ok', true, 'id', sub_id);
end $$;

-- ------------------------------------------------------------- storage
-- Private bucket: no public URLs, 10 MB per object at the storage layer. Per-question limits
-- are enforced by request_upload() and validate_submission(). Guarded because the storage
-- schema exists only on Supabase, not in the local PGlite test harness.
do $$
begin
  if to_regnamespace('storage') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('submissions', 'submissions', false, 10485760)
    on conflict (id) do update set public = false, file_size_limit = 10485760;

    execute 'drop policy if exists sf_submissions_upload on storage.objects';
    execute 'drop policy if exists sf_submissions_admin_read on storage.objects';
    execute $p$create policy sf_submissions_upload on storage.objects for insert to anon, authenticated
      with check (bucket_id = 'submissions' and public.pending_upload_is_valid(name))$p$;
    execute $p$create policy sf_submissions_admin_read on storage.objects for select to authenticated
      using (bucket_id = 'submissions' and public.is_admin())$p$;
  end if;
end $$;

-- ------------------------------------------------------------- privileges
alter table public.pending_uploads   enable row level security;
alter table public.submissions       enable row level security;
alter table public.submission_files  enable row level security;
alter table public.rate_limit_events enable row level security;

revoke all on public.pending_uploads, public.submissions, public.submission_files, public.rate_limit_events from anon, authenticated;
grant select on public.submissions, public.submission_files to authenticated;
grant delete on public.submissions to authenticated;

-- Admins can read responses and delete them (Phase 4 builds the UI). Nobody can edit them.
create policy submissions_admin_select on public.submissions for select to authenticated using (public.is_admin());
create policy submissions_admin_delete on public.submissions for delete to authenticated using (public.is_admin());
create policy submission_files_admin_select on public.submission_files for select to authenticated using (public.is_admin());
-- pending_uploads and rate_limit_events: RLS on with no policies = no client access.

revoke all on function public.sf_answered(jsonb), public.sf_eval_condition(jsonb, jsonb), public.sf_eval_rule(jsonb, jsonb),
  public.sf_is_visible(jsonb, jsonb), public.sf_effective_answers(jsonb, jsonb), public.sf_is_iso_date(text),
  public.sf_pattern_passes(text, text), public.sf_validate_answer(jsonb, jsonb), public.validate_submission(uuid, jsonb, jsonb),
  public.consume_rate_limit(text, integer, interval), public.sf_caller_hash(uuid)
  from public, anon, authenticated;

revoke all on function public.get_public_form(text), public.request_upload(text, text, text, text, bigint),
  public.submit_response(text, jsonb, text), public.pending_upload_is_valid(text) from public;
grant execute on function public.get_public_form(text) to anon, authenticated;
grant execute on function public.request_upload(text, text, text, text, bigint) to anon, authenticated;
grant execute on function public.submit_response(text, jsonb, text) to anon, authenticated;
grant execute on function public.pending_upload_is_valid(text) to anon, authenticated;
