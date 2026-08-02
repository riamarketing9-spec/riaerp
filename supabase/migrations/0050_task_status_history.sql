-- 0050_task_status_history.sql
-- Logs every status change a task goes through, with a timestamp -- lets
-- PM/CEO see how long a task actually sat in each stage (new -> in review
-- -> done), without exposing that timing to the assignee themselves.

create table task_status_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  status_id uuid not null references task_statuses(id),
  changed_at timestamptz not null default now()
);

create index idx_task_status_log_task on task_status_log (task_id, changed_at);

alter table task_status_log enable row level security;

-- PM/CEO only -- deliberately excludes the assignee themselves, per spec
-- ("видно не самому сотруднику, а только PM и CEO").
create policy task_status_log_select on task_status_log for select using (
  is_ceo()
  or has_capability('projects.manage')
  or exists (
    select 1 from tasks t where t.id = task_status_log.task_id
    and t.project_id is not null and is_pm_of_project(t.project_id)
  )
);
-- Writes only ever happen via the trigger (security definer) below.

create or replace function log_task_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into task_status_log (task_id, status_id) values (new.id, new.status_id);
  elsif new.status_id is distinct from old.status_id then
    insert into task_status_log (task_id, status_id) values (new.id, new.status_id);
  end if;
  return new;
end;
$$;

create trigger trg_tasks_log_status_change
  after insert or update on tasks
  for each row execute function log_task_status_change();

-- Backfill: one entry per existing task at its current status, so the
-- duration calc has a starting point instead of showing nothing for
-- tasks created before this migration.
insert into task_status_log (task_id, status_id, changed_at)
select id, status_id, created_at from tasks;
