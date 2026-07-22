-- 0026_audit_fixes.sql
-- Fixes from a full end-to-end audit of the system (real logic bugs, not
-- new features): finance.write semantics, and two time-tracking gaps (CEO
-- couldn't close a stuck/forgotten open session, PMs couldn't see their own
-- team's attendance at all).

-- =========================================================================
-- A. finance.write alone didn't actually grant anything -- every finance
--    RLS policy went through is_finance(), which only checked
--    finance.read. A profile granted finance.write (but not finance.read)
--    via profile_capability_overrides would see the Finance/KPI nav+routes
--    on the frontend (which check "finance.read OR finance.write") but
--    every RLS check would then reject them.
-- =========================================================================

create or replace function is_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select has_capability('finance.read') or has_capability('finance.write');
$$;

-- =========================================================================
-- B. Time tracking: CEO can now force-close a stuck/forgotten open session
--    (e.g. someone left Start running over a weekend) -- previously there
--    was no update/delete policy for anyone but the entry's own owner, so
--    not even the CEO could close it.
-- =========================================================================

create policy time_entries_update_ceo on time_entries
  for update using (is_ceo())
  with check (is_ceo());

-- =========================================================================
-- C. Time tracking: a PM could only ever see their OWN time entries
--    (time_entries_select_own) or, if they were also CEO, everyone's
--    (time_entries_select_ceo) -- there was no scoped visibility into
--    their own team's attendance at all, unlike tasks/content-plan which
--    PMs already see for their projects. "Team" is defined the same way
--    tasks_select_pm_scoped/content_plan already do: anyone assigned a
--    task or content-plan role in a project this PM (or assistant PM)
--    owns.
-- =========================================================================

create policy time_entries_select_pm_team on time_entries
  for select using (
    exists (
      select 1 from tasks t
      where t.assignee_profile_id = time_entries.profile_id
        and t.project_id is not null
        and (is_pm_of_project(t.project_id) or is_assistant_pm_of_project(t.project_id))
    )
    or exists (
      select 1 from content_plan_items cpi
      where (
        cpi.shooter_profile_id = time_entries.profile_id
        or cpi.editor_profile_id = time_entries.profile_id
        or cpi.responsible_profile_id = time_entries.profile_id
      )
      and (is_pm_of_project(cpi.project_id) or is_assistant_pm_of_project(cpi.project_id))
    )
  );
