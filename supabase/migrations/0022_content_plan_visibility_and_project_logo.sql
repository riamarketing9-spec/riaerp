-- 0022_content_plan_visibility_and_project_logo.sql
--
-- 1. Content-plan visibility: a shooter/editor/responsible assigned directly
--    to a content_plan_items row could not see it unless they were also a
--    project_member with projects.read_scoped — e.g. a syomkachi assigned as
--    shooter on one item, with no capabilities at all, was completely blind
--    to their own assignment. Add direct-assignment visibility.
-- 2. Project logo — new nullable column so projects can be told apart
--    visually (Projects page cards, content-plan folders/calendar cards).

drop policy if exists content_plan_select_scoped on content_plan_items;
create policy content_plan_select_scoped on content_plan_items for select using (
  is_assistant_pm_of_project(project_id)
  or shooter_profile_id = auth_profile_id()
  or editor_profile_id = auth_profile_id()
  or responsible_profile_id = auth_profile_id()
  or (
    has_capability('projects.read_scoped')
    and (is_pm_of_project(project_id) or is_project_member(project_id))
  )
);

alter table projects add column if not exists logo_url text;
