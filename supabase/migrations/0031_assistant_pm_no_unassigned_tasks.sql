-- 0031_assistant_pm_no_unassigned_tasks.sql
-- Further client feedback: unassigned tasks should only ever surface to the
-- real PM or CEO (who are the ones who'd assign them) -- not to an
-- assistant PM either. 0030 let an assistant PM see unassigned tasks "to
-- pick up open work"; that's scrapped. An assistant PM now sees only their
-- own tasks in the project, exactly like a regular team member.

drop policy if exists tasks_select_assistant_pm_scoped on tasks;
create policy tasks_select_assistant_pm_scoped on tasks for select using (
  project_id is not null
  and is_assistant_pm_of_project(project_id)
  and assignee_profile_id = auth_profile_id()
);

drop policy if exists tasks_update_assistant_pm_scoped on tasks;
create policy tasks_update_assistant_pm_scoped on tasks for update using (
  project_id is not null
  and is_assistant_pm_of_project(project_id)
  and assignee_profile_id = auth_profile_id()
);
