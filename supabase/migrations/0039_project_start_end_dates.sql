-- 0039_project_start_end_dates.sql
-- New project card redesign needs a start/end date per project (shown as
-- two date pickers, editable by the project's PM or CEO like every other
-- project field -- covered by the existing projects_write_pm/ceo policies,
-- no RLS changes needed since those are row-level, not column-level).

alter table projects add column if not exists start_date date;
alter table projects add column if not exists end_date date;
