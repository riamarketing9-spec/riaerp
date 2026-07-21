-- 0017_multiselect_fields.sql
-- Client clarified "multiselect everywhere except priority/urgency" means:
-- fields where multiple values are genuinely meaningful. Two candidates:
-- a task can require more than one deliverable type at once (e.g. Design
-- post + Design cover together), and a project can have more than one
-- assistant PM. Fields that are the basis of RLS/permissions or represent a
-- single point-in-time state (role, project/task status, project type) stay
-- single-select — multiplying those would break the access-control model.

create table task_deliverable_types (
  task_id uuid not null references tasks(id) on delete cascade,
  deliverable_type_id uuid not null references deliverable_types(id),
  primary key (task_id, deliverable_type_id)
);

alter table task_deliverable_types enable row level security;

create policy task_deliverable_types_select on task_deliverable_types for select using (
  exists (
    select 1 from tasks t where t.id = task_deliverable_types.task_id and (
      is_ceo()
      or t.assignee_profile_id = auth_profile_id()
      or (t.project_id is not null and is_pm_of_project(t.project_id))
    )
  )
);
create policy task_deliverable_types_write on task_deliverable_types for all using (
  exists (
    select 1 from tasks t where t.id = task_deliverable_types.task_id and (
      is_ceo()
      or t.assignee_profile_id = auth_profile_id()
      or (t.project_id is not null and is_pm_of_project(t.project_id))
    )
  )
) with check (
  exists (
    select 1 from tasks t where t.id = task_deliverable_types.task_id and (
      is_ceo()
      or t.assignee_profile_id = auth_profile_id()
      or (t.project_id is not null and is_pm_of_project(t.project_id))
    )
  )
);

-- Backfill existing single-value assignments into the new join table.
insert into task_deliverable_types (task_id, deliverable_type_id)
select id, deliverable_type_id from tasks where deliverable_type_id is not null
on conflict do nothing;
