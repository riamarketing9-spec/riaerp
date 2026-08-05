-- Flexible per-format monthly targets, replacing the fixed target_posts/
-- target_stories/target_ads columns on project_monthly_goals with a
-- "pick a work type, type a number" repeatable list -- same idea as иш
-- тури itself, not a giant static list. Old columns kept as-is (unused
-- going forward, nothing dropped) so no historical data is lost.
create table project_monthly_goal_targets (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references project_monthly_goals(id) on delete cascade,
  format_id uuid not null references content_formats(id),
  target_count int not null default 0,
  unique (goal_id, format_id)
);

alter table project_monthly_goal_targets enable row level security;

create policy project_monthly_goal_targets_select on project_monthly_goal_targets for select using (
  exists (
    select 1 from project_monthly_goals g
    where g.id = project_monthly_goal_targets.goal_id
      and (is_ceo() or is_pm_of_project(g.project_id) or is_project_member(g.project_id) or has_capability('projects.manage'))
  )
);

create policy project_monthly_goal_targets_write on project_monthly_goal_targets for all using (
  exists (
    select 1 from project_monthly_goals g
    where g.id = project_monthly_goal_targets.goal_id
      and (is_ceo() or is_pm_of_project(g.project_id) or has_capability('projects.manage'))
  )
);
