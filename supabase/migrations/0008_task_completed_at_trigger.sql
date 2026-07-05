-- 0008_task_completed_at_trigger.sql
-- Auto-stamp tasks.completed_at when a task's status moves to "done" (and
-- clear it if moved back out of done). This is a DB trigger rather than
-- frontend logic so it covers every update path (kanban drag, list view,
-- future mobile client, etc.) — and it's what makes automatic piece-rate
-- payroll calculation possible (payroll counts tasks completed in a period).

create or replace function set_task_completed_at()
returns trigger language plpgsql as $$
declare
  done_id uuid;
begin
  select id into done_id from task_statuses where slug = 'done';
  if new.status_id = done_id and (old.status_id is distinct from new.status_id) then
    new.completed_at = now();
  elsif new.status_id is distinct from done_id and old.status_id = done_id then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

create trigger trg_tasks_completed_at
  before update on tasks
  for each row execute function set_task_completed_at();
