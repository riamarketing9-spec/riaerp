-- Guarantee, independent of the capability system: anyone who is
-- pm_profile_id on ANY project sees ALL tasks, including a personal task
-- an employee added for themselves with no project attached at all --
-- tasks_select_pm_scoped only ever matched when project_id was set AND
-- matched one of the PM's own projects, so a project-less self-added
-- task fell through the cracks for a PM who (for whatever reason -- role
-- misconfiguration, a revoked override) didn't also hold the general
-- projects.manage capability that tasks_select_management checks.
-- Purely additive, doesn't touch any existing policy.
create policy tasks_select_any_pm_sees_all on tasks for select using (
  exists (select 1 from projects proj where proj.pm_profile_id = auth_profile_id())
);
