-- 0057_unschedule_daily_report.sql
-- Retire the fixed-21:00 bulk daily report (0025_daily_report_cron.sql) --
-- superseded by attendance-notify's per-employee report, which fires the
-- instant each person clocks out instead of everyone getting one summary
-- at a fixed hour regardless of when they actually worked. Both were
-- running in parallel until now, sending duplicate/conflicting reports.
-- The daily-report edge function itself is left deployed but now unused
-- (no longer worth deleting -- nothing calls it once the cron job is gone).

select cron.unschedule('daily-report-21-00-tashkent');
