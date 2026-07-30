-- 0042_profile_apprentice_flag.sql
-- "Shogird" (apprentice/trainee) is an independent flag, not a role or
-- department: someone can be e.g. a video editor in the Production
-- department *and* still be a trainee, and the UI needs to call that out
-- distinctly wherever the person is listed.

alter table profiles add column is_apprentice boolean not null default false;

-- Carry the flag through from admin-invite-user's user_metadata, same as
-- full_name/role_slug/department_slug already are (see 0012's
-- handle_new_auth_user).
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (auth_user_id, full_name, role_id, department_id, is_apprentice)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    (select id from roles where slug = coalesce(new.raw_user_meta_data->>'role_slug', 'shogird') limit 1),
    (select id from departments where slug = new.raw_user_meta_data->>'department_slug' limit 1),
    coalesce((new.raw_user_meta_data->>'is_apprentice')::boolean, false)
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;
