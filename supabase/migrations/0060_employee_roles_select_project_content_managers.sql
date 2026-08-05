-- Same reasoning as 0059: someone assigning content-plan/project work needs
-- to see other employees' secondary roles too (e.g. a Targetolog also
-- checked off as Montajchi should show up in the editor picker), not just
-- their own. Additive -- existing policies untouched.
create policy employee_roles_select_project_content_managers on employee_roles for select using (
  has_capability('projects.manage') or has_capability('content_plan.manage')
);
