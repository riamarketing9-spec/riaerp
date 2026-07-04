-- 0006_deadline_check_cron.sql
-- Schedules the deadline-check Edge Function every 30 minutes via pg_cron +
-- pg_net. The function is deployed with --no-verify-jwt and instead checks
-- an `x-cron-secret` header against the CRON_SECRET function secret, since
-- this call originates from Postgres itself, not a logged-in user.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'deadline-check-every-30-min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://emrnxnhyiqnjjptmgwvd.supabase.co/functions/v1/deadline-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '2fda5ed3172419224307bc729b6068e6b177fc94094dbde1'
    ),
    body := '{}'::jsonb
  );
  $$
);
