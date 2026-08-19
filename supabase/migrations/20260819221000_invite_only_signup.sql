-- Public sign-up is invite-only. GoTrue sets invited_at for admin invites.
create or replace function private.block_uninvited_auth_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invited_at is not null then
    return new;
  end if;
  if coalesce(new.raw_user_meta_data->>'invited_by', '') <> '' then
    return new;
  end if;
  raise exception 'Signup is invite-only';
end;
$$;

drop trigger if exists block_uninvited_auth_users on auth.users;
create trigger block_uninvited_auth_users
  before insert on auth.users
  for each row
  execute function private.block_uninvited_auth_users();
