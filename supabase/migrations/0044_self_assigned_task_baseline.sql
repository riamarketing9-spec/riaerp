-- 0044_self_assigned_task_baseline.sql
-- Baseline right for every employee, regardless of role/capabilities: keep
-- your own personal to-do list. Previously tasks_insert required CEO/PM/
-- projects.manage, so a plain employee (e.g. a Shogird with zero
-- capabilities) could not create a task at all -- the "+ Vazifa" button was
-- shown to them anyway, but saving would fail on the RLS check. And once
-- assigned a task, 0029's trigger locked a plain assignee to status-only
-- edits even on a task they made for themselves.
--
-- Now: anyone can insert a task where they're both creator and assignee,
-- and can fully edit it for as long as it stays self-assigned. A task
-- someone else (PM/CEO) created for them is unaffected -- still
-- status-only, per 0029.

drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks for insert with check (
  is_ceo()
  or (project_id is not null and (is_pm_of_project(project_id) or is_assistant_pm_of_project(project_id)))
  or has_capability('projects.manage')
  or (assignee_profile_id = auth_profile_id() and created_by = auth_profile_id())
);

create or replace function enforce_task_assignee_field_restriction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_ceo()
    or (new.project_id is not null and (is_pm_of_project(new.project_id) or is_assistant_pm_of_project(new.project_id)))
    or has_capability('projects.manage')
  then
    return new;
  end if;

  -- A task the current user made for themselves (still self-assigned) is
  -- theirs to fully manage -- only a task handed to them BY someone else
  -- gets the status-only restriction below.
  if old.created_by = auth_profile_id() and old.assignee_profile_id = auth_profile_id() then
    return new;
  end if;

  if old.assignee_profile_id is distinct from auth_profile_id() then
    return new;
  end if;

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
