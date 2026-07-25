-- 0035_tasks_delete_permissions_and_fk_fix.sql
-- Two related fixes surfaced by a real deletion attempt:
--
-- 1. Deleting a task with any notification_log history failed with
--    "violates foreign key constraint notification_log_related_task_id_fkey"
--    -- that FK (and its content-plan sibling from 0023) never got an ON
--    DELETE clause, unlike every other FK pointing at tasks(id)
--    (task_mentions/task_comments/task_items/task_deliverable_types all
--    cascade). SET NULL here (not CASCADE) since notification_log is a
--    history/audit trail -- the log entry itself should survive, just with
--    its task reference cleared.
--
-- 2. tasks_delete (untouched since 0002) only ever allowed the CEO or a
--    project's own PM to delete. Client feedback: CEO/PM should be able to
--    delete any task; a regular employee should additionally be able to
--    delete a task ONLY if they both created it and it's assigned to
--    themselves (a genuine personal/self-assigned task, not something
--    handed to them by someone else).

alter table notification_log
  drop constraint notification_log_related_task_id_fkey,
  add constraint notification_log_related_task_id_fkey
    foreign key (related_task_id) references tasks(id) on delete set null;

alter table notification_log
  drop constraint notification_log_related_content_plan_item_id_fkey,
  add constraint notification_log_related_content_plan_item_id_fkey
    foreign key (related_content_plan_item_id) references content_plan_items(id) on delete set null;

drop policy if exists tasks_delete on tasks;
create policy tasks_delete on tasks for delete using (
  is_ceo()
  or has_capability('projects.manage')
  or (project_id is not null and is_pm_of_project(project_id))
  or (created_by = auth_profile_id() and assignee_profile_id = auth_profile_id())
);
