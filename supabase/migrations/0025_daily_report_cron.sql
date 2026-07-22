-- 0025_daily_report_cron.sql
-- CEO asked for an automatic daily work-report notification "в 21-00 по
-- ташкентскому времени" (Asia/Tashkent = UTC+5, no DST) -- that's 16:00 UTC.
-- Same pg_cron + pg_net pattern as 0006_deadline_check_cron.sql, hitting a
-- new edge function instead of reusing deadline-check.

select cron.schedule(
  'daily-report-21-00-tashkent',
  '0 16 * * *',
  $$
  select net.http_post(
    url := 'https://emrnxnhyiqnjjptmgwvd.supabase.co/functions/v1/daily-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '2fda5ed3172419224307bc729b6068e6b177fc94094dbde1'
    ),
    body := '{}'::jsonb
  );
  $$
);
