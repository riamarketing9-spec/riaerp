-- 07:00 Tashkent = 02:00 UTC (UTC+5, no DST). See checklist-regenerate
-- edge function for what it does.
select cron.schedule(
  'checklist-regenerate-daily-0700-tashkent',
  '0 2 * * *',
  $$
  select net.http_post(
    url := 'https://emrnxnhyiqnjjptmgwvd.supabase.co/functions/v1/checklist-regenerate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '2fda5ed3172419224307bc729b6068e6b177fc94094dbde1'
    ),
    body := '{}'::jsonb
  );
  $$
);
