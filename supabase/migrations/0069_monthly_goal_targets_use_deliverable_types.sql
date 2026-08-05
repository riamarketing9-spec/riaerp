-- Correction: monthly goal targets ("то же самое что есть в иш тури")
-- must be keyed by deliverable_types too, not content_formats -- this
-- table was created moments ago in 0066 and is still empty in production,
-- so repointing the FK in place is safe (nothing to migrate).
alter table project_monthly_goal_targets rename column format_id to deliverable_type_id;
alter table project_monthly_goal_targets drop constraint project_monthly_goal_targets_format_id_fkey;
alter table project_monthly_goal_targets add constraint project_monthly_goal_targets_deliverable_type_id_fkey
  foreign key (deliverable_type_id) references deliverable_types(id);
alter table project_monthly_goal_targets rename constraint project_monthly_goal_targets_goal_id_format_id_key
  to project_monthly_goal_targets_goal_id_deliverable_type_id_key;
