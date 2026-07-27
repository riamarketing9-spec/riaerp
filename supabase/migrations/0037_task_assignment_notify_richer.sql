-- 0037_task_assignment_notify_richer.sql
-- The assignment notification only had the task title and deadline --
-- nowhere near enough to act on without opening the app. Pass project_id
-- and created_by through as well (both already present on `new` at trigger
-- time, no extra lookup needed); the edge function resolves them to names
-- and adds deliverable types ("ish turi") itself.

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
        'deadline', new.deadline,
        'project_id', new.project_id,
        'created_by', new.created_by
      )
    );
  end if;
  return new;
end;
$$;
