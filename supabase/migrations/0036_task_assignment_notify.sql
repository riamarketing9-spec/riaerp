-- 0036_task_assignment_notify.sql
-- Only the bot's own task-creation flow (createTaskFromBot in
-- telegram-webhook) DMs the assignee -- a task created or reassigned
-- through the web app (TaskSheet.tsx) never notified anyone, since there
-- was no trigger on `tasks` calling out via pg_net, unlike time_entries
-- (see 0027_attendance_notify.sql, the template this mirrors). Fires only
-- when assignee_profile_id is actually set/changed to a non-null value --
-- not on every unrelated field edit -- and skips tasks created via the bot
-- itself (created_via_telegram), since createTaskFromBot already sends its
-- own richer notification and this would otherwise double-DM.

create or replace function notify_task_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_profile_id is not null
     and not new.created_via_telegram
     and (TG_OP = 'INSERT' or old.assignee_profile_id is distinct from new.assignee_profile_id)
  then
    perform net.http_post(
      url := 'https://emrnxnhyiqnjjptmgwvd.supabase.co/functions/v1/task-assigned-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', '2fda5ed3172419224307bc729b6068e6b177fc94094dbde1'
      ),
      body := jsonb_build_object(
        'task_id', new.id,
        'assignee_profile_id', new.assignee_profile_id,
        'title', new.title,
        'deadline', new.deadline
      )
    );
  end if;
  return new;
end;
$$;

create trigger trg_tasks_assignment_notify
  after insert or update on tasks
  for each row execute function notify_task_assigned();
