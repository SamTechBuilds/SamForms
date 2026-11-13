-- Migration 0002: form_versions (immutable publish snapshots), form_templates,
-- forms.published_version_id FK, draft revision tracking, publish_form() RPC.
-- Security model: docs/SECURITY.md. RLS on every table; anon has NO access.

-- ------------------------------------------------- canonical schema guard
-- Mirrors FIELD_TYPES in src/schema/form.ts. A test (tests/db/migration0002.test.ts)
-- fails if the two lists ever diverge.
create or replace function public.form_field_types()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'short_text','long_text',
    'name','email','phone','url',
    'number','currency',
    'single_choice','multiple_choice','dropdown',
    'yes_no','toggle',
    'date','time','date_range',
    'star_rating','linear_scale','opinion_scale',
    'file_upload','image_upload',
    'signature','color_picker',
    'heading','description','image','divider'
  ]::text[];
$$;

-- Server-side structural validation of a canonical FormSchema document.
-- Returns a list of human-readable problems (empty = valid). It enforces the
-- invariants the database depends on (version, title, sections, unique ids,
-- known field types, section/rule references, choice options, size cap). Full
-- per-type config validation is done by the Zod field registry in the app and
-- again by the Phase 3 submit function when it loads a published version.
create or replace function public.validate_form_schema(s jsonb)
returns text[] language plpgsql immutable set search_path = '' as $$
declare
  errs     text[] := '{}';
  sec      jsonb;
  q        jsonb;
  r        jsonb;
  c        jsonb;
  o        jsonb;
  sec_ids  text[] := '{}';
  q_ids    text[] := '{}';
  qid      text;
  id_re    constant text := '^[A-Za-z0-9_-]{1,64}$';
  choice   constant text[] := array['single_choice','multiple_choice','dropdown'];
begin
  if s is null or jsonb_typeof(s) <> 'object' then
    return array['schema must be a JSON object'];
  end if;
  if octet_length(s::text) > 1000000 then
    return array['schema exceeds 1 MB'];
  end if;
  if s->'schemaVersion' is distinct from '1'::jsonb then
    errs := errs || 'schemaVersion must be 1'::text;
  end if;
  if coalesce(jsonb_typeof(s->'title'), '') <> 'string' or length(btrim(s->>'title')) not between 1 and 200 then
    errs := errs || 'title must be 1-200 characters'::text;
  end if;
  if s ? 'layout' and coalesce(s->>'layout', '') not in ('conversational', 'classic') then
    errs := errs || 'layout must be conversational or classic'::text;
  end if;

  -- sections
  if coalesce(jsonb_typeof(s->'sections'), '') <> 'array' or jsonb_array_length(s->'sections') = 0 then
    errs := errs || 'at least one section is required'::text;
  else
    for sec in select value from jsonb_array_elements(s->'sections') loop
      if coalesce(jsonb_typeof(sec->'id'), '') <> 'string' or (sec->>'id') !~ id_re then
        errs := errs || 'section has an invalid id'::text;
      elsif (sec->>'id') = any(sec_ids) then
        errs := errs || format('duplicate section id %s', sec->>'id');
      else
        sec_ids := sec_ids || (sec->>'id');
      end if;
      if coalesce(jsonb_typeof(sec->'title'), '') <> 'string' then
        errs := errs || format('section %s needs a title string', coalesce(sec->>'id', '?'));
      end if;
    end loop;
  end if;

  -- questions (pass 1: ids, types, sections, options)
  if coalesce(jsonb_typeof(s->'questions'), '') <> 'array' then
    return errs || 'questions must be an array'::text;
  end if;
  if jsonb_array_length(s->'questions') > 500 then
    errs := errs || 'a form can have at most 500 questions'::text;
  end if;
  for q in select value from jsonb_array_elements(s->'questions') loop
    qid := q->>'id';
    if coalesce(jsonb_typeof(q->'id'), '') <> 'string' or qid !~ id_re then
      errs := errs || 'question has an invalid id'::text;
      continue;
    end if;
    if qid = any(q_ids) then
      errs := errs || format('duplicate question id %s', qid);
    end if;
    q_ids := q_ids || qid;
    if coalesce(q->>'type', '') <> all(public.form_field_types()) then
      errs := errs || format('question %s has unknown type %s', qid, coalesce(q->>'type', 'null'));
    end if;
    if coalesce(q->>'sectionId', '') <> all(sec_ids) then
      errs := errs || format('question %s references an unknown section', qid);
    end if;
    if coalesce(jsonb_typeof(q->'label'), '') <> 'string' then
      errs := errs || format('question %s needs a label string', qid);
    end if;
    if q ? 'required' and jsonb_typeof(q->'required') <> 'boolean' then
      errs := errs || format('question %s: required must be boolean', qid);
    end if;
    if (q->>'type') = any(choice) then
      if coalesce(jsonb_typeof(q->'options'), '') <> 'array' or jsonb_array_length(q->'options') = 0 then
        errs := errs || format('choice question %s needs options', qid);
      else
        for o in select value from jsonb_array_elements(q->'options') loop
          if coalesce(o->>'id', '') !~ id_re or length(coalesce(o->>'label', '')) = 0 or length(coalesce(o->>'value', '')) = 0 then
            errs := errs || format('question %s has an invalid option', qid);
          end if;
        end loop;
      end if;
    end if;
  end loop;

  -- questions (pass 2: rule references)
  for q in select value from jsonb_array_elements(s->'questions') loop
    if coalesce(jsonb_typeof(q->'rules'), 'array') <> 'array' then
      errs := errs || format('question %s: rules must be an array', coalesce(q->>'id', '?'));
      continue;
    end if;
    for r in select value from jsonb_array_elements(coalesce(q->'rules', '[]'::jsonb)) loop
      if coalesce(r->>'combinator', '') not in ('and', 'or') then
        errs := errs || format('question %s has a rule with an invalid combinator', q->>'id');
      end if;
      if coalesce(jsonb_typeof(r->'conditions'), '') <> 'array' or jsonb_array_length(r->'conditions') = 0 then
        errs := errs || format('question %s has a rule without conditions', q->>'id');
      else
        for c in select value from jsonb_array_elements(r->'conditions') loop
          if coalesce(c->>'questionId', '') <> all(q_ids) then
            errs := errs || format('question %s has a condition referencing unknown question %s', q->>'id', coalesce(c->>'questionId', 'null'));
          end if;
          if coalesce(c->>'operator', '') not in ('equals','not_equals','contains','greater_than','less_than','is_answered','is_empty') then
            errs := errs || format('question %s has a condition with an unknown operator', q->>'id');
          end if;
        end loop;
      end if;
      if coalesce(r->'action'->>'type', '') not in ('show', 'hide', 'goto_section') then
        errs := errs || format('question %s has a rule with an unknown action', q->>'id');
      elsif r->'action'->>'type' = 'goto_section' and coalesce(r->'action'->>'sectionId', '') <> all(sec_ids) then
        errs := errs || format('question %s has a rule jumping to an unknown section', q->>'id');
      end if;
    end loop;
  end loop;

  return errs;
end $$;

-- ---------------------------------------------------------- form_versions
create table public.form_versions (
  id            uuid primary key default gen_random_uuid(),
  form_id       uuid not null references public.forms(id) on delete restrict,
  version       integer not null check (version > 0),
  title         text not null check (length(btrim(title)) between 1 and 200),
  schema        jsonb not null check (jsonb_typeof(schema) = 'object'),
  published_by  uuid references public.admin_users(id) on delete restrict,
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint form_versions_form_version_key unique (form_id, version),
  -- target of the composite FK from forms (guarantees a form can only point at its own versions)
  constraint form_versions_form_id_id_key unique (form_id, id),
  constraint form_versions_schema_valid check (cardinality(public.validate_form_schema(schema)) = 0)
);
create index form_versions_form_version_idx on public.form_versions (form_id, version desc);

-- Immutable: no UPDATE/DELETE/TRUNCATE for anyone (including admins and service role).
create or replace function public.form_versions_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'form_versions are immutable';
end $$;
create trigger form_versions_no_update_delete before update or delete on public.form_versions
  for each row execute function public.form_versions_immutable();
create trigger form_versions_no_truncate before truncate on public.form_versions
  for each statement execute function public.form_versions_immutable();

-- ------------------------------------------------------- forms additions
alter table public.forms
  add column draft_revision     integer not null default 0 check (draft_revision >= 0),
  add column published_revision integer check (published_revision is null or published_revision >= 0),
  add constraint forms_published_version_fk
    foreign key (id, published_version_id) references public.form_versions (form_id, id);
create index forms_published_version_idx on public.forms (published_version_id) where published_version_id is not null;

-- Server-maintained columns + lifecycle guard.
--  * draft_revision increments whenever draft_schema changes (optimistic concurrency for autosave);
--    the client can never set it.
--  * Only publish_form() may set status='published' or change published_version_id/published_revision.
create or replace function public.forms_guard_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.draft_revision := 0;
    new.published_revision := null;
    return new;
  end if;
  if new.draft_schema is distinct from old.draft_schema then
    new.draft_revision := old.draft_revision + 1;
  else
    new.draft_revision := old.draft_revision;
  end if;
  if coalesce(current_setting('samforms.publishing', true), '') <> 'on' then
    if new.published_version_id is distinct from old.published_version_id
       or new.published_revision is distinct from old.published_revision then
      raise exception 'published version can only be changed by publish_form()' using errcode = '42501';
    end if;
    if new.status = 'published' and old.status <> 'published' then
      raise exception 'forms can only be published through publish_form()' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger forms_guard_write before insert or update on public.forms
  for each row execute function public.forms_guard_write();

-- A form that has ever been published keeps its version history (submissions will
-- reference it), so it can be archived but not deleted.
create or replace function public.forms_guard_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.form_versions v where v.form_id = old.id) then
    raise exception 'a form that has been published cannot be deleted; archive it instead' using errcode = '23503';
  end if;
  return old;
end $$;
create trigger forms_guard_delete before delete on public.forms
  for each row execute function public.forms_guard_delete();

-- ---------------------------------------------------------- publish_form
-- The only way to publish. Validates the *stored* draft (never a client payload),
-- creates the next immutable version, points the form at it and audits it, in one
-- transaction. Re-publishing content identical to the latest version re-uses that
-- version instead of creating a duplicate.
create or replace function public.publish_form(p_form_id uuid, p_expected_revision integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f       public.forms%rowtype;
  latest  public.form_versions%rowtype;
  v       public.form_versions%rowtype;
  errs    text[];
  reused  boolean := false;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into f from public.forms where id = p_form_id for update;
  if not found then
    raise exception 'form not found' using errcode = 'P0002';
  end if;
  if f.status = 'archived' then
    raise exception 'archived forms cannot be published; restore the form first' using errcode = '22023';
  end if;
  if p_expected_revision is not null and p_expected_revision <> f.draft_revision then
    raise exception 'draft has changed since it was loaded (expected revision %, current %)', p_expected_revision, f.draft_revision
      using errcode = '40001';
  end if;
  errs := public.validate_form_schema(f.draft_schema);
  if cardinality(errs) > 0 then
    raise exception 'form schema is invalid: %', array_to_string(errs, '; ') using errcode = '22023';
  end if;

  select * into latest from public.form_versions fv where fv.form_id = f.id order by fv.version desc limit 1;
  if found and latest.schema = f.draft_schema then
    v := latest;
    reused := true;
  else
    insert into public.form_versions (form_id, version, title, schema, published_by)
    values (f.id, coalesce(latest.version, 0) + 1, btrim(f.draft_schema->>'title'), f.draft_schema, auth.uid())
    returning * into v;
  end if;

  perform set_config('samforms.publishing', 'on', true);
  update public.forms
     set status = 'published', published_version_id = v.id, published_revision = f.draft_revision, archived_at = null
   where id = f.id;
  perform set_config('samforms.publishing', '', true);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'form.published', 'form', f.id,
          jsonb_build_object('title', v.title, 'version', v.version, 'reused', reused));

  return jsonb_build_object('id', v.id, 'version', v.version, 'published_at', v.published_at, 'reused', reused);
end $$;

-- --------------------------------------------------------- form_templates
create table public.form_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(btrim(name)) between 1 and 120),
  description  text check (description is null or length(description) <= 500),
  category     text not null default 'general' check (category ~ '^[a-z0-9_-]{1,40}$'),
  schema       jsonb not null check (jsonb_typeof(schema) = 'object'),
  is_system    boolean not null default false,
  created_by   uuid references public.admin_users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint form_templates_schema_valid check (cardinality(public.validate_form_schema(schema)) = 0),
  constraint form_templates_system_unowned check (not is_system or created_by is null)
);
create index form_templates_listing_idx on public.form_templates (is_system desc, category, name);
create trigger form_templates_set_updated_at before update on public.form_templates
  for each row execute function public.set_updated_at();

create or replace function public.audit_form_templates_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is not null and not exists (select 1 from public.admin_users where id = actor) then
    actor := null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (actor, 'template.created', 'template', new.id, jsonb_build_object('title', new.name));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (actor, 'template.deleted', 'template', old.id, jsonb_build_object('title', old.name));
    return old;
  end if;
  return new;
end $$;
-- System templates are seeded below before this trigger exists, so seeding is not audited.

-- System templates (read-only for clients). Each schema passes validate_form_schema and,
-- in tests, the canonical Zod FormSchema + field registry.
insert into public.form_templates (name, description, category, is_system, schema) values
  ('Customer enquiry', 'Collect contact details and a message from potential customers.', 'enquiry', true, '{"schemaVersion":1,"title":"Customer enquiry","description":"Tell us how we can help and we''ll get back to you.","layout":"conversational","sections":[{"id":"s1","title":"Your enquiry","pageBreakAfter":false}],"questions":[{"id":"name","type":"name","sectionId":"s1","label":"What''s your name?","required":true,"config":{},"validation":{},"rules":[]},{"id":"email","type":"email","sectionId":"s1","label":"Your email address","required":true,"config":{},"validation":{},"rules":[],"placeholder":"name@example.com"},{"id":"phone","type":"phone","sectionId":"s1","label":"Phone number","required":false,"config":{},"validation":{},"rules":[],"description":"Optional — if you prefer a call."},{"id":"topic","type":"single_choice","sectionId":"s1","label":"What is your enquiry about?","required":true,"config":{},"validation":{},"rules":[],"options":[{"id":"o1","label":"Sales","value":"sales"},{"id":"o2","label":"Support","value":"support"},{"id":"o3","label":"Partnership","value":"partnership"},{"id":"o4","label":"Other","value":"other"}]},{"id":"message","type":"long_text","sectionId":"s1","label":"Your message","required":true,"config":{},"validation":{"maxLength":2000},"rules":[]}],"completionScreen":{"title":"Thank you!","message":"Your response has been received."}}'::jsonb),
  ('Client onboarding', 'Gather business details, project scope and contacts from a new client.', 'onboarding', true, '{"schemaVersion":1,"title":"Client onboarding","description":"A few details so we can kick off your project.","layout":"conversational","sections":[{"id":"biz","title":"About your business","pageBreakAfter":true},{"id":"proj","title":"Your project","pageBreakAfter":true},{"id":"contact","title":"Main contact","pageBreakAfter":false}],"questions":[{"id":"company","type":"short_text","sectionId":"biz","label":"Company name","required":true,"config":{},"validation":{},"rules":[]},{"id":"website","type":"url","sectionId":"biz","label":"Current website","required":false,"config":{},"validation":{},"rules":[],"placeholder":"https://"},{"id":"industry","type":"dropdown","sectionId":"biz","label":"Industry","required":true,"config":{},"validation":{},"rules":[],"options":[{"id":"o1","label":"Retail","value":"retail"},{"id":"o2","label":"Hospitality","value":"hospitality"},{"id":"o3","label":"Professional services","value":"professional_services"},{"id":"o4","label":"Healthcare","value":"healthcare"},{"id":"o5","label":"Technology","value":"technology"},{"id":"o6","label":"Other","value":"other"}]},{"id":"employees","type":"number","sectionId":"biz","label":"Number of employees","required":false,"config":{"allowDecimals":false},"validation":{"min":1},"rules":[]},{"id":"services","type":"multiple_choice","sectionId":"proj","label":"Which services do you need?","required":true,"config":{},"validation":{},"rules":[],"options":[{"id":"o1","label":"Website","value":"website"},{"id":"o2","label":"Branding","value":"branding"},{"id":"o3","label":"Online store","value":"online_store"},{"id":"o4","label":"SEO","value":"seo"},{"id":"o5","label":"Maintenance","value":"maintenance"}]},{"id":"budget","type":"currency","sectionId":"proj","label":"Approximate budget","required":false,"config":{"currency":"USD"},"validation":{"min":0},"rules":[]},{"id":"start","type":"date","sectionId":"proj","label":"Preferred start date","required":false,"config":{},"validation":{},"rules":[]},{"id":"goals","type":"long_text","sectionId":"proj","label":"What are your main goals?","required":true,"config":{},"validation":{},"rules":[]},{"id":"contact_name","type":"name","sectionId":"contact","label":"Contact name","required":true,"config":{},"validation":{},"rules":[]},{"id":"contact_email","type":"email","sectionId":"contact","label":"Contact email","required":true,"config":{},"validation":{},"rules":[]},{"id":"contact_phone","type":"phone","sectionId":"contact","label":"Contact phone","required":false,"config":{},"validation":{},"rules":[]}],"completionScreen":{"title":"Thank you!","message":"Your response has been received."},"welcomeScreen":{"title":"Welcome aboard!","message":"This takes about 5 minutes.","buttonLabel":"Start"}}'::jsonb),
  ('Event registration', 'Register attendees, ticket types and dietary needs.', 'events', true, '{"schemaVersion":1,"title":"Event registration","description":"Reserve your place.","layout":"conversational","sections":[{"id":"s1","title":"Registration","pageBreakAfter":false}],"questions":[{"id":"name","type":"name","sectionId":"s1","label":"Full name","required":true,"config":{},"validation":{},"rules":[]},{"id":"email","type":"email","sectionId":"s1","label":"Email","required":true,"config":{},"validation":{},"rules":[]},{"id":"ticket","type":"single_choice","sectionId":"s1","label":"Ticket type","required":true,"config":{},"validation":{},"rules":[],"options":[{"id":"o1","label":"General admission","value":"general_admission"},{"id":"o2","label":"VIP","value":"vip"},{"id":"o3","label":"Student","value":"student"}]},{"id":"dietary","type":"yes_no","sectionId":"s1","label":"Do you have dietary requirements?","required":true,"config":{},"validation":{},"rules":[]},{"id":"dietary_details","type":"long_text","sectionId":"s1","label":"Please describe your dietary requirements","required":true,"config":{},"validation":{},"rules":[{"id":"r1","combinator":"and","conditions":[{"questionId":"dietary","operator":"equals","value":true}],"action":{"type":"show"}}]},{"id":"consent","type":"toggle","sectionId":"s1","label":"I agree to receive event updates by email","required":true,"config":{"onLabel":"I agree"},"validation":{},"rules":[]}],"completionScreen":{"title":"Thank you!","message":"Your response has been received."}}'::jsonb),
  ('Job application', 'Accept applications with CV upload and availability.', 'hr', true, '{"schemaVersion":1,"title":"Job application","description":"Apply to join our team.","layout":"conversational","sections":[{"id":"about","title":"About you","pageBreakAfter":true},{"id":"role","title":"The role","pageBreakAfter":false}],"questions":[{"id":"name","type":"name","sectionId":"about","label":"Full name","required":true,"config":{},"validation":{},"rules":[]},{"id":"email","type":"email","sectionId":"about","label":"Email","required":true,"config":{},"validation":{},"rules":[]},{"id":"phone","type":"phone","sectionId":"about","label":"Phone","required":true,"config":{},"validation":{},"rules":[]},{"id":"linkedin","type":"url","sectionId":"about","label":"LinkedIn or portfolio URL","required":false,"config":{},"validation":{},"rules":[]},{"id":"position","type":"dropdown","sectionId":"role","label":"Position applied for","required":true,"config":{},"validation":{},"rules":[],"options":[{"id":"o1","label":"Front-end developer","value":"front_end_developer"},{"id":"o2","label":"Back-end developer","value":"back_end_developer"},{"id":"o3","label":"Designer","value":"designer"},{"id":"o4","label":"Project manager","value":"project_manager"}]},{"id":"experience","type":"number","sectionId":"role","label":"Years of relevant experience","required":true,"config":{"allowDecimals":false},"validation":{"min":0,"max":60},"rules":[]},{"id":"cv","type":"file_upload","sectionId":"role","label":"Upload your CV","required":true,"config":{},"validation":{"allowedMimeTypes":["application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document"],"maxFileSizeMb":10,"maxFiles":1},"rules":[]},{"id":"cover","type":"long_text","sectionId":"role","label":"Why do you want this role?","required":false,"config":{},"validation":{},"rules":[]},{"id":"available","type":"date","sectionId":"role","label":"Earliest start date","required":false,"config":{},"validation":{},"rules":[]}],"completionScreen":{"title":"Thank you!","message":"Your response has been received."}}'::jsonb),
  ('Feedback survey', 'Measure satisfaction and collect improvement ideas.', 'survey', true, '{"schemaVersion":1,"title":"Feedback survey","description":"Help us improve — it takes 2 minutes.","layout":"conversational","sections":[{"id":"s1","title":"Feedback","pageBreakAfter":false}],"questions":[{"id":"overall","type":"star_rating","sectionId":"s1","label":"How would you rate your overall experience?","required":true,"config":{"max":5},"validation":{},"rules":[]},{"id":"nps","type":"opinion_scale","sectionId":"s1","label":"How likely are you to recommend us to a friend?","required":true,"config":{"start":0,"end":10,"leftLabel":"Not likely","rightLabel":"Very likely"},"validation":{},"rules":[]},{"id":"liked","type":"multiple_choice","sectionId":"s1","label":"What did you like?","required":false,"config":{},"validation":{},"rules":[],"options":[{"id":"o1","label":"Quality","value":"quality"},{"id":"o2","label":"Speed","value":"speed"},{"id":"o3","label":"Communication","value":"communication"},{"id":"o4","label":"Price","value":"price"}]},{"id":"improve","type":"long_text","sectionId":"s1","label":"What could we have done better?","required":false,"config":{},"validation":{},"rules":[{"id":"r1","combinator":"and","conditions":[{"questionId":"overall","operator":"less_than","value":4}],"action":{"type":"show"}}]},{"id":"followup","type":"yes_no","sectionId":"s1","label":"May we contact you about your feedback?","required":false,"config":{},"validation":{},"rules":[]},{"id":"email","type":"email","sectionId":"s1","label":"Your email","required":true,"config":{},"validation":{},"rules":[{"id":"r2","combinator":"and","conditions":[{"questionId":"followup","operator":"equals","value":true}],"action":{"type":"show"}}]}],"completionScreen":{"title":"Thank you!","message":"Your response has been received."}}'::jsonb);

create trigger form_templates_audit after insert or delete on public.form_templates
  for each row execute function public.audit_form_templates_changes();

-- ------------------------------------------------------------ privileges
revoke all on public.form_versions, public.form_templates from anon, authenticated;
revoke all on function public.publish_form(uuid, integer) from public, anon;
revoke all on function public.validate_form_schema(jsonb) from public, anon;
revoke all on function public.form_field_types() from public, anon;
grant execute on function public.publish_form(uuid, integer) to authenticated;   -- re-checks is_admin()
grant execute on function public.validate_form_schema(jsonb) to authenticated;   -- pure, no data access

grant select on public.form_versions to authenticated;                          -- read-only (RLS: admin); writes only via publish_form()

grant select on public.form_templates to authenticated;
grant insert (name, description, category, schema, created_by) on public.form_templates to authenticated;
grant update (name, description, category, schema) on public.form_templates to authenticated;
grant delete on public.form_templates to authenticated;

-- forms: tighten Phase 1 grants to the columns a client may legitimately write.
-- status/published_version_id/published_revision/draft_revision are additionally guarded by forms_guard_write.
revoke insert, update on public.forms from authenticated;
grant insert (owner_id, title, slug, draft_schema) on public.forms to authenticated;
grant update (title, slug, status, draft_schema, archived_at) on public.forms to authenticated;

-- -------------------------------------------------------------------- RLS
alter table public.form_versions  enable row level security;
alter table public.form_templates enable row level security;

create policy form_versions_admin_select on public.form_versions
  for select to authenticated using (public.is_admin());

create policy form_templates_admin_select on public.form_templates
  for select to authenticated using (public.is_admin());
create policy form_templates_admin_insert on public.form_templates
  for insert to authenticated with check (public.is_admin() and not is_system and created_by = auth.uid());
create policy form_templates_admin_update on public.form_templates
  for update to authenticated using (public.is_admin() and not is_system)
  with check (public.is_admin() and not is_system);
create policy form_templates_admin_delete on public.form_templates
  for delete to authenticated using (public.is_admin() and not is_system);
