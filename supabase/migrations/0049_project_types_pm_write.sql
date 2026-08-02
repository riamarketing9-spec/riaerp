-- 0049_project_types_pm_write.sql
-- project_types (currently just Target/SMM) write access was CEO-only.
-- CEO and PM should both be able to add a new project type -- lets the
-- "+" button on the project card's Type field actually work for a PM, not
-- just CEO.

drop policy if exists project_types_write on project_types;
create policy project_types_write on project_types for all using (
  is_ceo() or has_capability('projects.manage')
) with check (
  is_ceo() or has_capability('projects.manage')
);
