-- Secondary positions (employee_roles, "Qo'shimcha lavozimlar" on the Team
-- page) used to be purely informational -- the UI even said so explicitly
-- ("ruxsatlarga ta'sir qilmaydi"). Per the CEO: an employee checked off as
-- e.g. SMM manager assistant should actually get that role's capabilities,
-- not just a label. profile_capability_overrides still wins either way
-- (coalesce first), so an explicit revoke on an employee still blocks a
-- capability even if a secondary role would otherwise grant it.
create or replace function public.has_capability(cap text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
    or exists (
      select 1
      from profiles p
      join employee_roles er on er.profile_id = p.id
      join role_capabilities rc on rc.role_id = er.role_id
      where p.auth_user_id = auth.uid() and rc.capability = cap
    )
  );
$function$;

create or replace function public.has_capability_for_profile(p_profile_id uuid, p_capability text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(
    (
      select granted
      from profile_capability_overrides pco
      where pco.profile_id = p_profile_id and pco.capability = p_capability
    ),
    exists (
      select 1
      from profiles p
      join role_capabilities rc on rc.role_id = p.role_id
      where p.id = p_profile_id and rc.capability = p_capability
    )
    or exists (
      select 1
      from profiles p
      join employee_roles er on er.profile_id = p.id
      join role_capabilities rc on rc.role_id = er.role_id
      where p.id = p_profile_id and rc.capability = p_capability
    )
  );
$function$;
