-- 0012_profile_capability_overrides.sql
-- The permission model was purely role-level (role_capabilities), with no
-- way to grant or revoke a single capability for one specific person beyond
-- their role's defaults — unlike document_visibility, which already does
-- exactly this pattern for individual documents. The CEO asked for the same
-- flexibility for capabilities generally ("максимально гибко и кастомно").
--
-- An override row wins over the role default in either direction: granted
-- = true adds a capability the role wouldn't otherwise have, granted =
-- false revokes one the role otherwise would have.

create table profile_capability_overrides (
  profile_id uuid not null references profiles(id) on delete cascade,
  capability text not null,
  granted boolean not null,
  granted_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  primary key (profile_id, capability)
);

alter table profile_capability_overrides enable row level security;

create policy profile_capability_overrides_select on profile_capability_overrides
  for select using (
    profile_id = auth_profile_id() or is_ceo()
  );

create policy profile_capability_overrides_write on profile_capability_overrides
  for all using (is_ceo()) with check (is_ceo());

-- InviteEmployeeDialog now also lets the CEO pick a department at invite
-- time; thread it through the same user_metadata -> trigger path as role_slug.
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (auth_user_id, full_name, role_id, department_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    (select id from roles where slug = coalesce(new.raw_user_meta_data->>'role_slug', 'shogird') limit 1),
    (select id from departments where slug = new.raw_user_meta_data->>'department_slug' limit 1)
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

create or replace function has_capability(cap text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select granted
      from profile_capability_overrides pco
      join profiles p on p.id = pco.profile_id
      where p.auth_user_id = auth.uid() and pco.capability = cap
    ),
    exists (
      select 1
      from profiles p
      join role_capabilities rc on rc.role_id = p.role_id
      where p.auth_user_id = auth.uid() and rc.capability = cap
    )
  );
$$;
