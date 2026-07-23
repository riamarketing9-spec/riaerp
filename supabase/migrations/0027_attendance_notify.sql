-- 0027_attendance_notify.sql
-- Notifies the CEO in real time when someone starts or stops their work
-- timer (time_entries), instead of only finding out at the 21:00 daily
-- report. Fires from the database itself via a trigger + pg_net, so it
-- works no matter which device/screen the Start/Stop click came from --
-- same shared-secret pattern as deadline-check and daily-report.

create or replace function notify_attendance_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    perform net.http_post(
      url := 'https://emrnxnhyiqnjjptmgwvd.supabase.co/functions/v1/attendance-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', '2fda5ed3172419224307bc729b6068e6b177fc94094dbde1'
      ),
      body := jsonb_build_object(
        'event', 'start',
        'profile_id', new.profile_id,
        'occurred_at', new.started_at
      )
    );
  elsif TG_OP = 'UPDATE' and old.ended_at is null and new.ended_at is not null then
    perform net.http_post(
      url := 'https://emrnxnhyiqnjjptmgwvd.supabase.co/functions/v1/attendance-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', '2fda5ed3172419224307bc729b6068e6b177fc94094dbde1'
      ),
      body := jsonb_build_object(
        'event', 'stop',
        'profile_id', new.profile_id,
        'started_at', new.started_at,
        'occurred_at', new.ended_at
      )
    );
  end if;
  return new;
end;
$$;

create trigger trg_time_entries_notify
  after insert or update on time_entries
  for each row execute function notify_attendance_change();
