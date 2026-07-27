-- 0038_task_assignment_notify_on_close_only.sql
-- Autosave means a task's row is created/updated on every debounced tick
-- while the sheet is still open, well before the user is done editing --
-- the assignment trigger from 0036/0037 fired on that very first insert
-- (as soon as title/project/status were filled and an assignee already
-- picked), so the Telegram DM went out long before the user actually
-- finished filling in priority/ish turi/etc. and closed the card.
--
-- Move this from "any row change" to "an explicit action": drop the
-- trigger, and expose a plain callable function the client invokes itself,
-- only from the sheet's explicit Save/Done handler (never from autosave).
-- The x-cron-secret stays server-side inside this function either way --
-- the client only ever calls the named RPC, never sees the secret.

drop trigger if exists trg_tasks_assignment_notify on tasks;

create or replace function notify_task_assigned_now(p_task_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t tasks%rowtype;
begin
  select * into t from tasks where id = p_task_id;
  if not found or t.assignee_profile_id is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://emrnxnhyiqnjjptmgwvd.supabase.co/functions/v1/task-assigned-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '2fda5ed3172419224307bc729b6068e6b177fc94094dbde1'
    ),
    body := jsonb_build_object(
      'task_id', t.id,
      'assignee_profile_id', t.assignee_profile_id,
      'title', t.title,
      'deadline', t.deadline,
      'project_id', t.project_id,
      'created_by', t.created_by
    )
  );
end;
$$;

grant execute on function notify_task_assigned_now(uuid) to authenticated;
