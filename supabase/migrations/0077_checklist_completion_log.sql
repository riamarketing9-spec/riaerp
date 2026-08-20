-- Daily/weekly/monthly checklist tasks get hard-deleted and recreated on
-- regeneration (checklist-regenerate, cascades task_status_log too) -- so
-- past days' сделано/не сделано state is physically gone once a task
-- regenerates, and a calendar-style "pick any past date" analytics filter
-- has nothing to read. This table is a daily snapshot, written once per
-- cron run (see checklist-regenerate) for every active recurring
-- checklist task, independent of whether that task itself regenerates
-- that day -- so every day gets a row, not just regen days.
create table checklist_completion_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete set null,
  title text not null,
  recurrence_id uuid references recurrence_types(id),
  assignee_profile_id uuid references profiles(id),
  is_done boolean not null,
  log_date date not null,
  created_at timestamptz not null default now()
);

create index idx_checklist_completion_log_date on checklist_completion_log (log_date);
create index idx_checklist_completion_log_assignee on checklist_completion_log (assignee_profile_id, log_date);
-- Guards against a double snapshot if checklist-regenerate is ever
-- triggered twice in the same Tashkent day (its upsert relies on this).
create unique index idx_checklist_completion_log_task_date on checklist_completion_log (task_id, log_date);

alter table checklist_completion_log enable row level security;

-- Own history, same baseline right everyone already has over their own
-- checklist tasks.
create policy checklist_completion_log_select_own on checklist_completion_log for select using (
  assignee_profile_id = auth_profile_id()
);

-- Team-wide history -- same capability gate as RecurringChecklistWidget's
-- existing teamWide prop (cabinets.read_all/projects.manage), so nothing
-- new is exposed beyond what already decides who sees the team's current
-- checklist state.
create policy checklist_completion_log_select_team on checklist_completion_log for select using (
  is_ceo() or has_capability('cabinets.read_all') or has_capability('projects.manage')
);

-- No insert/update/delete policy -- only checklist-regenerate (service
-- role key, bypasses RLS) ever writes here.
