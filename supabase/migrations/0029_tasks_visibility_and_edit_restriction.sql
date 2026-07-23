-- 0029_tasks_visibility_and_edit_restriction.sql
-- Two bugs in `tasks`, both about the gap between "assignee" and "PM/CEO":
--
-- A. tasks_select_pm_scoped's third branch granted every project MEMBER
--    (not just the PM) visibility of every task in the project, as long as
--    their role holds the 'projects.read_scoped' capability (smm_manager,
--    targetolog). That capability is meant for content-plan/project-level
--    visibility, not "see everyone's tasks" -- a plain team member should
--    only see their own tasks (already covered by tasks_select_own).
--
-- B. The assignee update policy only re-checked assignee_profile_id in its
--    WITH CHECK, so a plain assignee could edit ANY column on their own task
--    (title, deadline, project, reassign to someone else's queue, etc.) --
--    not just report status/progress like the PM/CEO intended. A BEFORE
--    UPDATE trigger enforces the column-level restriction that RLS's
--    row-level model can't express on its own.

drop policy if exists tasks_select_pm_scoped on tasks;
create policy tasks_select_pm_scoped on tasks for select using (
  project_id is not null and (
    is_pm_of_project(project_id) or is_assistant_pm_of_project(project_id)
  )
);

create or replace function enforce_task_assignee_field_restriction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- CEO, this project's PM/assistant PM, or anyone with blanket task-manage
  -- rights can change anything -- only the plain-assignee path is restricted.
  if is_ceo()
    or (new.project_id is not null and (is_pm_of_project(new.project_id) or is_assistant_pm_of_project(new.project_id)))
    or has_capability('projects.manage')
  then
    return new;
  end if;

  if old.assignee_profile_id is distinct from auth_profile_id() then
    -- Not the assignee's own task and not covered by the roles above --
    -- RLS's USING clause already decides whether this row is reachable at
    -- all; this trigger only narrows what an assignee may touch on it.
    return new;
  end if;

  -- percent_complete/completed_at/updated_at are side effects of subtask
  -- completion and status changes (set by their own triggers), not direct
  -- assignee edits, so they're exempt here rather than blocked.
  if new.title is distinct from old.title
    or new.project_id is distinct from old.project_id
    or new.assignee_profile_id is distinct from old.assignee_profile_id
    or new.priority_id is distinct from old.priority_id
    or new.is_urgent is distinct from old.is_urgent
    or new.is_important is distinct from old.is_important
    or new.recurrence_id is distinct from old.recurrence_id
    or new.deadline is distinct from old.deadline
    or new.blocker_text is distinct from old.blocker_text
    or new.deliverable_text is distinct from old.deliverable_text
    or new.content_plan_item_id is distinct from old.content_plan_item_id
    or new.created_by is distinct from old.created_by
    or new.deliverable_type_id is distinct from old.deliverable_type_id
    or new.term_type_id is distinct from old.term_type_id
    or new.starts_at is distinct from old.starts_at
    or new.quadrant_id is distinct from old.quadrant_id
  then
    raise exception 'Ijrochi faqat vazifa holatini o''zgartira oladi, boshqa maydonlarni emas.';
  end if;

  return new;
end;
$$;

create trigger trg_tasks_restrict_assignee_update
  before update on tasks
  for each row execute function enforce_task_assignee_field_restriction();
