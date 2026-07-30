-- 0045_fix_task_trigger_dropped_columns.sql
-- enforce_task_assignee_field_restriction (0029, carried forward verbatim by
-- 0044) still referenced tasks.is_urgent/is_important -- dropped back in
-- 0018 in favor of quadrant_id, which the trigger already also checks. Any
-- plain assignee's update on a task assigned to them by someone else
-- (anything, including a pure status change) hit this dead code path and
-- crashed with "record new has no field is_urgent" instead of saving --
-- PM/CEO edits never noticed since they bypass this branch entirely.

create or replace function enforce_task_assignee_field_restriction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_ceo()
    or (new.project_id is not null and (is_pm_of_project(new.project_id) or is_assistant_pm_of_project(new.project_id)))
    or has_capability('projects.manage')
  then
    return new;
  end if;

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
