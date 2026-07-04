-- 0004_fix_rls_recursion.sql
-- Fixes "infinite recursion detected in policy for relation project_members" (42P17).
-- Root cause: projects_select_member queried project_members directly, and
-- project_members_select queried projects directly, as the calling role —
-- each subquery re-triggered the other table's RLS, looping forever.
-- Fix: route the cross-table checks through SECURITY DEFINER helper functions,
-- which run as the (table-owning) function owner and therefore bypass RLS on
-- the table they query internally, breaking the cycle.

create or replace function is_project_member(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members pm
    where pm.project_id = p_project_id and pm.profile_id = auth_profile_id()
  );
$$;

drop policy if exists projects_select_member on projects;
create policy projects_select_member on projects for select using (
  is_project_member(id)
);

drop policy if exists project_members_select on project_members;
create policy project_members_select on project_members for select using (
  is_ceo()
  or profile_id = auth_profile_id()
  or is_pm_of_project(project_id)
);

drop policy if exists content_plan_select_scoped on content_plan_items;
create policy content_plan_select_scoped on content_plan_items for select using (
  has_capability('projects.read_scoped') and (
    is_pm_of_project(project_id) or is_project_member(project_id)
  )
);

drop policy if exists tasks_select_pm_scoped on tasks;
create policy tasks_select_pm_scoped on tasks for select using (
  project_id is not null and (
    is_pm_of_project(project_id)
    or (has_capability('projects.read_scoped') and is_project_member(project_id))
  )
);
