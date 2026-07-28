-- 0040_project_quota_target.sql
-- New project-card progress bar is quota-based: posts/reels use the
-- existing (until now unused) monthly_quota_posts/monthly_quota_reels
-- columns, target advertising is a yes/no toggle that didn't have a column
-- yet.

alter table projects add column if not exists target_enabled boolean not null default false;
