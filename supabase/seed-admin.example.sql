-- Bootstrap the single Super Admin. Run ONCE in the Supabase SQL editor (service role context),
-- AFTER creating the user in Dashboard > Authentication > Users ("Add user", email + password).
-- Public signup is disabled, so this is the only way an admin account comes to exist.
insert into public.admin_users (id, email, role)
select id, lower(email), 'super_admin'
from auth.users
where lower(email) = lower('REPLACE_WITH_ADMIN_EMAIL');
