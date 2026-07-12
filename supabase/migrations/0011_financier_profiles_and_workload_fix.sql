-- 0011_financier_profiles_and_workload_fix.sql
-- Two RLS/visibility gaps found in a role-visibility audit:
--
-- 1. `financier` role has finance.read/finance.write but not
--    cabinets.read_all, so profiles_select_management never matched them —
--    every employee picker on payroll screens (CreateFixedSalaryDialog,
--    CreateRateDialog, PayrollRuns) came back empty for a financier.
--
-- 2. v_employee_workload / v_employee_kpi were security_invoker = true, so
--    they inherited the viewer's own RLS on `tasks`. A PM viewing workload
--    sees every profile (via cabinets.read_all) but the `tasks` join is
--    still scoped to that PM's own projects (tasks_select_pm_scoped) — any
--    employee staffed on a DIFFERENT PM's project would show 0 open tasks,
--    looking idle when they're actually busy.
--
-- Fix: an explicit select policy for finance, and rebuilding the two views
-- as security_invoker = false (so the join sees all tasks) gated by an
-- explicit `where is_ceo() or has_capability('cabinets.read_all')` clause —
-- since the view no longer inherits RLS from `tasks`, the visibility check
-- has to live in the view itself, not be borrowed implicitly.

create policy profiles_select_finance on profiles
  for select using (is_finance());

drop view if exists v_employee_workload;
create view v_employee_workload with (security_invoker = false) as
select
  pr.id as profile_id,
  pr.full_name,
  pr.role_id,
  count(t.id) filter (
    where ts.slug not in ('done', 'backlog')
  ) as open_task_count,
  r.max_open_tasks,
  pr.workload_level_id
from profiles pr
left join tasks t on t.assignee_profile_id = pr.id
left join task_statuses ts on ts.id = t.status_id
left join roles r on r.id = pr.role_id
where is_ceo() or has_capability('cabinets.read_all')
group by pr.id, pr.full_name, pr.role_id, r.max_open_tasks, pr.workload_level_id;

drop view if exists v_employee_kpi;
create view v_employee_kpi with (security_invoker = false) as
select
  pr.id as profile_id,
  pr.full_name,
  count(t.id) filter (where ts.slug = 'done') as tasks_completed,
  count(t.id) filter (where ts.slug = 'done' and t.completed_at <= t.deadline) as tasks_on_time,
  avg(t.percent_complete) as avg_percent_complete
from profiles pr
left join tasks t on t.assignee_profile_id = pr.id
left join task_statuses ts on ts.id = t.status_id
where is_ceo() or has_capability('cabinets.read_all')
group by pr.id, pr.full_name;
