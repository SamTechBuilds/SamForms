-- Migration 0008: adds "ranking" to the canonical field type list (drag/reorder-to-rank
-- question). Purely additive: existing forms and responses are unaffected, since no question
-- used this type before it existed. Mirrors FIELD_TYPES in src/schema/form.ts (a test fails if
-- the two lists ever diverge).
create or replace function public.form_field_types()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'short_text','long_text',
    'name','email','phone','url',
    'number','currency',
    'single_choice','multiple_choice','dropdown','ranking',
    'yes_no','toggle',
    'date','time','date_range',
    'star_rating','linear_scale','opinion_scale',
    'file_upload','image_upload',
    'signature','color_picker',
    'heading','description','image','divider'
  ]::text[];
$$;
