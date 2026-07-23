-- 0032_time_entries_pm_only_team_visibility.sql
-- Same fix as 0030/0031, applied to attendance: time_entries_select_pm_team
-- let an assistant PM see their whole project team's clock-in/out history,
-- not just their own. Client feedback (mirroring the tasks fix): team-wide
-- attendance should only be visible to the real PM and CEO -- an assistant
-- PM sees only their own time entries, like a regular employee.

drop policy if exists time_entries_select_pm_team on time_entries;
create policy time_entries_select_pm_team on time_entries
  for select using (
    exists (
      select 1 from tasks t
      where t.assignee_profile_id = time_entries.profile_id
        and t.project_id is not null
        and is_pm_of_project(t.project_id)
    )
    or exists (
      select 1 from content_plan_items cpi
      where (
        cpi.shooter_profile_id = time_entries.profile_id
        or cpi.editor_profile_id = time_entries.profile_id
        or cpi.responsible_profile_id = time_entries.profile_id
      )
      and is_pm_of_project(cpi.project_id)
    )
  );
