-- 0048_task_recurrence_and_checklist_sync.sql
-- Two additive automations requested for tasks:
--
-- A. Checklist <-> status stay in sync both ways:
--    - Checking off every subtask auto-moves the task to "done".
--    - Manually moving a task to "done" auto-checks every subtask (and if
--      there are no subtasks at all, percent_complete jumps straight to
--      100 -- previously it only ever moved via the subtask-ratio trigger,
--      so a task with zero subtasks stayed frozen at whatever it was).
--
-- B. A task with a daily/weekly/monthly recurrence spawns its next
--    instance the moment it's marked done -- fresh row (status back to
--    "new"), same title/project/assignee/checklist template, deadline
--    shifted by the recurrence interval. The just-completed row is left
--    alone so payroll/reports still count it. One-time tasks never spawn.

create or replace function recompute_task_percent_complete()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  affected_task_id uuid;
  total int;
  done int;
  done_status_id uuid;
begin
  affected_task_id := coalesce(new.task_id, old.task_id);

  select count(*), count(*) filter (where is_done)
    into total, done
    from task_items where task_id = affected_task_id;

  select id into done_status_id from task_statuses where slug = 'done';

  if total > 0 then
    update tasks
      set percent_complete = round(done::numeric / total * 100),
          status_id = case when done = total then done_status_id else status_id end
      where id = affected_task_id;
  end if;

  return null;
end;
$$;

-- Clone task_items (unchecked) for a freshly spawned recurring task.
create or replace function clone_task_items(source_task_id uuid, new_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into task_items (task_id, title, is_done, sort_order)
  select new_task_id, title, false, sort_order from task_items where task_id = source_task_id;
end;
$$;

create or replace function sync_task_done_checklist_and_recurrence() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  done_status_id uuid;
  new_status_id uuid;
  has_items boolean;
  next_deadline timestamptz;
  recurrence_slug text;
  new_task_id uuid;
begin
  select id into done_status_id from task_statuses where slug = 'done';
  if new.status_id is distinct from done_status_id or old.status_id = done_status_id then
    return new;
  end if;

  -- Task just moved INTO done.
  select exists(select 1 from task_items where task_id = new.id) into has_items;
  if has_items then
    update task_items set is_done = true where task_id = new.id and is_done = false;
  else
    update tasks set percent_complete = 100 where id = new.id;
  end if;

  select slug into recurrence_slug from recurrence_types where id = new.recurrence_id;
  if recurrence_slug is null or recurrence_slug = 'one_time' then
    return new;
  end if;

  next_deadline := case recurrence_slug
    when 'daily' then coalesce(new.deadline, now()) + interval '1 day'
    when 'weekly' then coalesce(new.deadline, now()) + interval '7 days'
    when 'monthly' then coalesce(new.deadline, now()) + interval '1 month'
    else null
  end;

  select id into new_status_id from task_statuses where slug = 'backlog';

  insert into tasks (
    title, project_id, assignee_profile_id, status_id, priority_id, recurrence_id,
    deadline, deliverable_text, content_plan_item_id, created_by, deliverable_type_id,
    term_type_id, quadrant_id
  ) values (
    new.title, new.project_id, new.assignee_profile_id, new_status_id, new.priority_id, new.recurrence_id,
    next_deadline, new.deliverable_text, new.content_plan_item_id, new.created_by, new.deliverable_type_id,
    new.term_type_id, new.quadrant_id
  ) returning id into new_task_id;

  perform clone_task_items(new.id, new_task_id);

  insert into task_deliverable_types (task_id, deliverable_type_id)
  select new_task_id, deliverable_type_id from task_deliverable_types where task_id = new.id;

  return new;
end;
$$;

create trigger trg_tasks_sync_checklist_and_recurrence
  after update on tasks
  for each row execute function sync_task_done_checklist_and_recurrence();
