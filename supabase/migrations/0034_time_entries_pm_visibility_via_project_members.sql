-- 0034_time_entries_pm_visibility_via_project_members.sql
-- time_entries_select_pm_team (0032) decided "is this employee on my team"
-- indirectly, by checking whether they currently have an assigned task or a
-- content-plan role in one of the PM's projects. That silently drops anyone
-- who is a real project member but has no open task right now (between
-- tasks, or only ever assigned via the project itself) -- their timer/work
-- status then just never shows up for the PM/CEO, which reads as "the
-- counter doesn't work for that employee." project_members is the actual
-- source of truth for team membership (already used by is_project_member()/
-- projects_select_member), so check that directly instead of reverse-
-- engineering membership from unrelated tables.

drop policy if exists time_entries_select_pm_team on time_entries;
create policy time_entries_select_pm_team on time_entries
  for select using (
    exists (
      select 1 from project_members pmem
      where pmem.profile_id = time_entries.profile_id
        and (is_pm_of_project(pmem.project_id) or is_assistant_pm_of_project(pmem.project_id))
    )
  );
