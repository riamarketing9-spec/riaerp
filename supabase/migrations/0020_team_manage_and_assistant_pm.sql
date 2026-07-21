-- 0020_team_manage_and_assistant_pm.sql
--
-- Two independent fixes bundled together:
--
-- 1. New `team.manage` capability so a PM can invite/edit/delete employees
--    and grant/revoke capabilities — WITHOUT becoming CEO-equivalent
--    everywhere (org.full_access stays untouched/separate). A team.manage
--    holder who isn't a true CEO can never grant/revoke org.full_access,
--    finance.read, finance.write, or team.manage itself (to anyone,
--    including themselves), and can never set anyone's primary role to
--    the `ceo` role. Enforced here at the RLS layer (defense in depth
--    beyond the client-side hiding in EditEmployeeDialog.tsx).
--
-- 2. Assistant-PM visibility fix: is_project_member() doesn't care about
--    role_on_project, and tasks_select_pm_scoped/content_plan_select_scoped
--    additionally require the capability projects.read_scoped — which
--    montajchi/designer/syomkachi/shogird roles don't have at all. So an
--    assistant PM staffed via project_members(role_on_project='assistant_pm')
--    could see the project card but not its tasks/content-plan. New
--    is_assistant_pm_of_project() helper + extending the read AND write
--    policies so an assistant PM can actually see and work on the project
--    they were added to help with.

-- =========================================================================
-- A. team.manage capability
-- =========================================================================
insert into role_capabilities (role_id, capability)
select r.id, 'team.manage' from roles r where r.slug = 'pm'
on conflict do nothing;

drop policy if exists profiles_write_ceo on profiles;
create policy profiles_write_management on profiles for all using (
  is_ceo() or has_capability('team.manage')
) with check (
  is_ceo()
  or (
    has_capability('team.manage')
    and role_id <> (select id from roles where slug = 'ceo')
  )
);

drop policy if exists employee_roles_write on employee_roles;
create policy employee_roles_write on employee_roles for all using (
  is_ceo() or has_capability('team.manage')
) with check (
  is_ceo()
  or (
    has_capability('team.manage')
    and role_id <> (select id from roles where slug = 'ceo')
  )
);

drop policy if exists profile_capability_overrides_write on profile_capability_overrides;
create policy profile_capability_overrides_write on profile_capability_overrides for all using (
  is_ceo() or has_capability('team.manage')
) with check (
  is_ceo()
  or (
    has_capability('team.manage')
    and capability not in ('org.full_access', 'finance.read', 'finance.write', 'team.manage')
    and profile_id <> auth_profile_id()
  )
);

-- =========================================================================
-- B. Assistant-PM visibility fix
-- =========================================================================
create or replace function is_assistant_pm_of_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members pm
    where pm.project_id = p_project_id
      and pm.profile_id = auth_profile_id()
      and pm.role_on_project = 'assistant_pm'
  );
$$;

drop policy if exists tasks_select_pm_scoped on tasks;
create policy tasks_select_pm_scoped on tasks for select using (
  project_id is not null and (
    is_pm_of_project(project_id)
    or is_assistant_pm_of_project(project_id)
    or (has_capability('projects.read_scoped') and is_project_member(project_id))
  )
);

drop policy if exists content_plan_select_scoped on content_plan_items;
create policy content_plan_select_scoped on content_plan_items for select using (
  is_assistant_pm_of_project(project_id)
  or (
    has_capability('projects.read_scoped')
    and (is_pm_of_project(project_id) or is_project_member(project_id))
  )
);

drop policy if exists content_plan_write on content_plan_items;
create policy content_plan_write on content_plan_items for all using (
  is_ceo() or is_pm_of_project(project_id) or is_assistant_pm_of_project(project_id) or has_capability('projects.manage')
) with check (
  is_ceo() or is_pm_of_project(project_id) or is_assistant_pm_of_project(project_id) or has_capability('projects.manage')
);

drop policy if exists content_plan_platforms_write on content_plan_platforms;
create policy content_plan_platforms_write on content_plan_platforms for all using (
  is_ceo() or exists (
    select 1 from content_plan_items cpi
    where cpi.id = content_plan_platforms.content_plan_item_id
      and (is_pm_of_project(cpi.project_id) or is_assistant_pm_of_project(cpi.project_id))
  )
) with check (
  is_ceo() or exists (
    select 1 from content_plan_items cpi
    where cpi.id = content_plan_platforms.content_plan_item_id
      and (is_pm_of_project(cpi.project_id) or is_assistant_pm_of_project(cpi.project_id))
  )
);

drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks for insert with check (
  is_ceo()
  or (project_id is not null and (is_pm_of_project(project_id) or is_assistant_pm_of_project(project_id)))
  or has_capability('projects.manage')
);

drop policy if exists tasks_update_management on tasks;
create policy tasks_update_management on tasks for update using (
  is_ceo()
  or (project_id is not null and (is_pm_of_project(project_id) or is_assistant_pm_of_project(project_id)))
  or has_capability('projects.manage')
);
