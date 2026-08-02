-- 0052_workload_views_exclude_deleted.sql
-- 0043 added profiles.deleted_at (soft delete) with the stated intent that
-- "active-roster queries (Team page, assignee pickers, workload view) should
-- exclude removed employees by default" -- but v_employee_workload and
-- v_employee_kpi were never actually updated to filter on it, so a removed
-- employee kept showing up on the Workload page (Jamoa bandligi) with their
-- last-known open-task count and completed-task total.

drop view if exists v_ceo_dashboard;
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
where (is_ceo() or has_capability('cabinets.read_all')) and pr.deleted_at is null
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
where (is_ceo() or has_capability('cabinets.read_all')) and pr.deleted_at is null
group by pr.id, pr.full_name;

create view v_ceo_dashboard with (security_invoker = true) as
select
  (select coalesce(sum(amount), 0) from finance_project_revenue where month = date_trunc('month', now())::date) as mrr,
  (select count(*) from projects proj join project_statuses ps on ps.id = proj.status_id where ps.slug = 'active') as active_projects,
  (select count(*) from tasks where deadline < now() and status_id not in (select id from task_statuses where slug = 'done')) as overdue_tasks,
  (select count(*) from v_employee_workload where open_task_count > max_open_tasks) as overloaded_employees;
