-- Same bug class as 0059/0060: tasks_update_management and tasks_delete
-- already granted projects.manage, but SELECT never did (for select/for
-- update/for delete are separate policy sets, not "for all"), so a
-- projects.manage override holder who wasn't literally the project's
-- pm_profile_id or a project_members row got an empty task list/kanban.
-- cabinets.read_all (Workload/KPI pages) had the exact same gap.
create policy tasks_select_management on tasks for select using (
  has_capability('projects.manage') or has_capability('cabinets.read_all')
);

-- task_items_select/task_items_write both stop at ceo/assignee/pm-of-project,
-- with no projects.manage or cabinets.read_all branch either.
create policy task_items_select_management on task_items for select using (
  exists (
    select 1 from tasks t
    where t.id = task_items.task_id
      and (has_capability('projects.manage') or has_capability('cabinets.read_all'))
  )
);
