-- 0056_project_monthly_goals_structured.sql
-- Replace the free-text monthly goal + the project-level (never actually
-- per-month) quota columns with one structured per-month target: post
-- count (reels+post+carousel counted together, per spec), story count, and
-- an ads/targeting yes-no flag. The old monthly_quota_posts/reels/stories/
-- shoots + target_enabled columns on `projects` were a single value that
-- never varied month to month despite the name; project_monthly_goals
-- already existed for the per-month concept but only held free text.
--
-- Existing data: one project ("Doctor Otto") had monthly_quota_reels=10
-- and a July 2026 goal row with free-text goal_text -- the number doesn't
-- map cleanly onto the new reels+post+carousel-combined "posts" target, so
-- it is NOT carried over automatically (an admin should set a real target
-- for the current/upcoming month). The free text itself is preserved,
-- renamed to `note` and made optional, so nothing is silently lost.

alter table project_monthly_goals rename column goal_text to note;
alter table project_monthly_goals alter column note drop not null;
alter table project_monthly_goals add column target_posts int not null default 0;
alter table project_monthly_goals add column target_stories int not null default 0;
alter table project_monthly_goals add column target_ads boolean not null default false;

alter table projects drop column monthly_quota_posts;
alter table projects drop column monthly_quota_reels;
alter table projects drop column monthly_quota_stories;
alter table projects drop column monthly_quota_shoots;
alter table projects drop column target_enabled;
