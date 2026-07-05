-- 0007_close_remaining_gaps.sql
-- Closes the remaining TZ gaps found in the second audit:
-- 1. PM monthly goals (structured, not just a single free-text field).
-- 2. Piece-rate payroll needs tasks/content_plan_items tagged with a
--    deliverable_type so a payroll run can auto-count completed work.
-- 3. Client interaction history (TZ: "история работы" с клиентом).
-- 4. content_plan_items needs a per-row "technical assignment" (TOR) text
--    field for designers/editors, separate from the general script.

create table project_monthly_goals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  month date not null,
  goal_text text not null,
  created_at timestamptz not null default now(),
  unique (project_id, month)
);

alter table project_monthly_goals enable row level security;

create policy project_monthly_goals_select on project_monthly_goals for select using (
  is_ceo() or is_pm_of_project(project_id) or is_project_member(project_id)
);
create policy project_monthly_goals_write on project_monthly_goals for all using (
  is_ceo() or is_pm_of_project(project_id)
) with check (
  is_ceo() or is_pm_of_project(project_id)
);

alter table tasks add column deliverable_type_id uuid references deliverable_types(id);
alter table content_plan_items add column deliverable_type_id uuid references deliverable_types(id);
alter table content_plan_items add column tor_text text; -- technical assignment for designer/editor

create table client_interactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  profile_id uuid references profiles(id),
  note text not null,
  created_at timestamptz not null default now()
);

alter table client_interactions enable row level security;

create policy client_interactions_select on client_interactions for select using (
  is_ceo()
  or (has_capability('sales.read') and exists (
    select 1 from leads l where l.client_id = client_interactions.client_id and l.owner_profile_id = auth_profile_id()
  ))
  or (has_capability('sales.read') and exists (
    select 1 from projects proj where proj.client_id = client_interactions.client_id and proj.pm_profile_id = auth_profile_id()
  ))
);
create policy client_interactions_write on client_interactions for all using (
  is_ceo() or has_capability('sales.manage')
) with check (
  is_ceo() or has_capability('sales.manage')
);

-- Auto-log a client_interactions row whenever a lead moves stage, so
-- "история работы" builds itself instead of requiring manual entry for
-- the most common event.
create or replace function log_lead_stage_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  stage_label text;
begin
  if new.stage_id is distinct from old.stage_id then
    select label_ru into stage_label from lead_stages where id = new.stage_id;
    insert into client_interactions (client_id, profile_id, note)
    values (new.client_id, new.owner_profile_id, 'Этап сделки изменён на: ' || coalesce(stage_label, '—'));
  end if;
  return new;
end;
$$;

create trigger trg_lead_stage_change
  after update on leads
  for each row execute function log_lead_stage_change();
