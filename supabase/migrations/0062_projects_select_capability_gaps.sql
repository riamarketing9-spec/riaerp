-- projects/project_members/project_monthly_goals SELECT only ever checked
-- ceo/pm/member -- projects_insert_pm already granted projects.manage for
-- INSERT, but nothing granted it for SELECT, so a projects.manage override
-- holder who isn't literally staffed as pm_profile_id or a project_members
-- row can't see the project row at all (or its members/monthly goals).
-- finance.read/finance.write need the same: FinancePage/v_project_profit
-- join through `projects` for the name, so without this a finance viewer
-- who isn't also a PM/member sees revenue/expense numbers with no project
-- name attached (empty-looking table).
create policy projects_select_management on projects for select using (
  has_capability('projects.manage') or has_capability('cabinets.read_all') or is_finance()
);

create policy project_members_select_management on project_members for select using (
  has_capability('projects.manage')
);

create policy project_monthly_goals_select_management on project_monthly_goals for select using (
  has_capability('projects.manage')
);
