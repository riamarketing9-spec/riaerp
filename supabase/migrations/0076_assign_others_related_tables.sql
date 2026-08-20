-- 0075 added tasks_insert_scoped_assign / tasks_update_own_created_scoped so
-- a tasks.assign_others holder (smm_manager/smm_assistant/shogird) can
-- create/edit a task for someone else. It missed that TaskSheet also
-- writes to 3 related tables when saving such a task (work types,
-- subtasks, comments) -- their existing write policies only recognize
-- is_ceo() / the task's own assignee / is_pm_of_project, none of which
-- match a creator who assigned the task to someone else. Reported live:
-- "new row violates row-level security policy for table
-- task_deliverable_types" when an smm_manager tried to save a task's
-- "Ish turi" for a colleague. Purely additive -- existing policies on all
-- 3 tables stay untouched, these are extra PERMISSIVE policies (OR-combined).

create policy task_deliverable_types_write_scoped_assign on task_deliverable_types for all using (
  exists (
    select 1 from tasks t
    where t.id = task_deliverable_types.task_id
      and t.created_by = auth_profile_id()
      and has_capability('tasks.assign_others')
  )
) with check (
  exists (
    select 1 from tasks t
    where t.id = task_deliverable_types.task_id
      and t.created_by = auth_profile_id()
      and has_capability('tasks.assign_others')
  )
);

create policy task_items_write_scoped_assign on task_items for all using (
  exists (
    select 1 from tasks t
    where t.id = task_items.task_id
      and t.created_by = auth_profile_id()
      and has_capability('tasks.assign_others')
  )
) with check (
  exists (
    select 1 from tasks t
    where t.id = task_items.task_id
      and t.created_by = auth_profile_id()
      and has_capability('tasks.assign_others')
  )
);

create policy task_comments_insert_scoped_assign on task_comments for insert with check (
  author_profile_id = auth_profile_id()
  and exists (
    select 1 from tasks t
    where t.id = task_comments.task_id
      and t.created_by = auth_profile_id()
      and has_capability('tasks.assign_others')
  )
);

-- Unlike the two FOR ALL policies above (whose USING clause implicitly
-- covers SELECT too), this one is FOR INSERT only, so it grants no SELECT
-- visibility on its own -- INSERT ... (implicit) RETURNING then fails
-- because Postgres re-checks the just-inserted row against SELECT
-- policies. Needed for the creator to see their own comment (and any
-- others') on a task they assigned to someone else, same fix shape as
-- tasks_select_created_scoped in 0075.
create policy task_comments_select_scoped_assign on task_comments for select using (
  exists (
    select 1 from tasks t
    where t.id = task_comments.task_id
      and t.created_by = auth_profile_id()
      and has_capability('tasks.assign_others')
  )
);
