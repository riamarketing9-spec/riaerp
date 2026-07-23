-- 0030_assistant_pm_task_visibility_scoped.sql
-- Client feedback: an assistant PM seeing every task in the project --
-- including tasks assigned to someone else -- makes no sense to them
-- ("зачем ему задачи другого человека"). Splits tasks_select_pm_scoped in
-- two: the real PM keeps full project visibility (that's the job), but an
-- assistant PM now only sees their own tasks plus unassigned ones (so they
-- can still pick up open work) -- not tasks someone else is responsible for.

drop policy if exists tasks_select_pm_scoped on tasks;
create policy tasks_select_pm_scoped on tasks for select using (
  project_id is not null and is_pm_of_project(project_id)
);

create policy tasks_select_assistant_pm_scoped on tasks for select using (
  project_id is not null
  and is_assistant_pm_of_project(project_id)
  and (assignee_profile_id = auth_profile_id() or assignee_profile_id is null)
);

-- Same split on the write side, so an assistant PM can't reach a task by ID
-- that they can no longer even see in the list. The real PM/CEO/
-- projects.manage path is unchanged.
drop policy if exists tasks_update_management on tasks;
create policy tasks_update_management on tasks for update using (
  is_ceo()
  or (project_id is not null and is_pm_of_project(project_id))
  or has_capability('projects.manage')
);

create policy tasks_update_assistant_pm_scoped on tasks for update using (
  project_id is not null
  and is_assistant_pm_of_project(project_id)
  and (assignee_profile_id = auth_profile_id() or assignee_profile_id is null)
);
