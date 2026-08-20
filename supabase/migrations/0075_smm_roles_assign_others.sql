-- SMM manager + shogird + smm_assistant (yordamchisi) can create/assign
-- tasks and content-plan responsibility to any employee EXCEPT pm/ceo.
-- Purely additive: new function, new capability, new RLS policies
-- alongside the existing ones (which stay untouched and keep working via
-- OR-combined PERMISSIVE policies). Existing content_plan.manage grant to
-- smm_assistant is untouched; only added to smm_manager/shogird here.

create or replace function is_pm_or_ceo(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    join roles r on r.id = p.role_id
    where p.id = p_profile_id and r.slug in ('pm', 'ceo')
  );
$$;

insert into role_capabilities (role_id, capability)
select r.id, 'tasks.assign_others'
from roles r
where r.slug in ('smm_manager', 'smm_assistant', 'shogird')
on conflict do nothing;

insert into role_capabilities (role_id, capability)
select r.id, 'content_plan.manage'
from roles r
where r.slug in ('smm_manager', 'shogird')
on conflict do nothing;

-- tasks: new, narrower insert/update policies for assign_others holders.
-- Existing tasks_insert / tasks_update_management / tasks_update_own stay
-- as-is; these are additional PERMISSIVE policies (OR-combined).
create policy tasks_insert_scoped_assign on tasks for insert with check (
  has_capability('tasks.assign_others')
  and created_by = auth_profile_id()
  and not is_pm_or_ceo(assignee_profile_id)
);

create policy tasks_update_own_created_scoped on tasks for update using (
  has_capability('tasks.assign_others')
  and created_by = auth_profile_id()
) with check (
  has_capability('tasks.assign_others')
  and created_by = auth_profile_id()
  and not is_pm_or_ceo(assignee_profile_id)
);

-- Without this, a creator with tasks.assign_others could insert a task
-- assigned to someone else (above policy) but never see it again --
-- tasks_select_own only covers assignee_profile_id, and this role has
-- neither projects.manage nor cabinets.read_all. Needed for the feature
-- to actually work end-to-end.
create policy tasks_select_created_scoped on tasks for select using (
  has_capability('tasks.assign_others')
  and created_by = auth_profile_id()
);

-- content_plan_responsibles / content_plan_person_deliverable_types:
-- the existing *_manager policies grant blanket "for all" to anyone with
-- content_plan.manage, with no with-check. Recreate them split into
-- using/with check so content_plan.manage holders can no longer add a
-- pm/ceo profile as a responsible person. Read access (using) is
-- unchanged; real PMs/CEOs keep full access via the separate
-- content_plan_write-derived policies (untouched, OR-combined).
drop policy if exists content_plan_responsibles_manager on content_plan_responsibles;
create policy content_plan_responsibles_manager on content_plan_responsibles for all using (
  has_capability('content_plan.manage')
) with check (
  has_capability('content_plan.manage') and not is_pm_or_ceo(profile_id)
);

drop policy if exists content_plan_person_deliverable_types_manager on content_plan_person_deliverable_types;
create policy content_plan_person_deliverable_types_manager on content_plan_person_deliverable_types for all using (
  has_capability('content_plan.manage')
) with check (
  has_capability('content_plan.manage') and not is_pm_or_ceo(profile_id)
);
