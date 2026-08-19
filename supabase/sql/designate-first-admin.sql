-- Run in the Supabase SQL editor AFTER the administrator registers
-- (Dashboard Authentication → Users, or the dashboard /login page).
-- Replace the email with the real admin address. Do not commit real emails
-- with passwords. This script only links an existing auth user to admin_users.

insert into public.admin_users (user_id, display_name, role)
select id, 'SimBox Administrator', 'admin'
from auth.users
where email = 'REPLACE_WITH_ADMIN_EMAIL@example.com'
on conflict (user_id) do nothing;

-- Confirm:
-- select u.email, a.role, a.created_at
-- from public.admin_users a
-- join auth.users u on u.id = a.user_id;
