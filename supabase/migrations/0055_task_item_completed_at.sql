-- 0055_task_item_completed_at.sql
-- Track how long each checklist item took to complete (from row creation to
-- being checked), so PM/CEO can see time-per-subtask the same way
-- task_status_log already shows time-per-status. A single before-insert-or-
-- update trigger on task_items stamps/clears completed_at based on the
-- is_done transition, so it transparently covers every write path: the
-- manual toggle (TaskSheet/TaskCard), the "mark whole task done -> force-
-- check all items" bulk update in sync_task_done_checklist_and_recurrence()
-- (0048) -- which fires this trigger once per row inside the same
-- transaction, so `now()` is identical across all of them, matching "если
-- поставил Tayyor без галочек, время пишется одинаковое" -- and
-- clone_task_items() inserting fresh unchecked rows for a respawned
-- recurring task (is_done=false, so completed_at is forced back to null,
-- never inherited from the source item).

alter table task_items add column completed_at timestamptz;

create or replace function task_items_track_completed_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.completed_at := case when new.is_done then now() else null end;
  else
    if new.is_done and not old.is_done then
      new.completed_at := now();
    elsif not new.is_done then
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_task_items_completed_at
  before insert or update on task_items
  for each row execute function task_items_track_completed_at();
