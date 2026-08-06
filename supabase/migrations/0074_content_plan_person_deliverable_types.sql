-- Precise attribution for reports: "who did which work type", not just
-- two disconnected lists (responsible people / work types) on the same
-- card. One row per (person, work type) pair -- a person can be linked
-- to several work types. This becomes the actual source of truth;
-- content_plan_responsibles and content_plan_deliverable_types are kept
-- populated too (derived: distinct profile_id / distinct deliverable_
-- type_id) so existing readers (calendar badges, monthly-goal percent
-- calc) keep working unchanged. Nothing dropped, purely additive.
create table content_plan_person_deliverable_types (
  content_plan_item_id uuid not null references content_plan_items(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  deliverable_type_id uuid not null references deliverable_types(id),
  primary key (content_plan_item_id, profile_id, deliverable_type_id)
);

-- Best-effort backfill: pair every existing responsible person with every
-- existing work type on the same item (can't know the real pairing
-- retroactively -- this is a starting point, not a claim of precision).
insert into content_plan_person_deliverable_types (content_plan_item_id, profile_id, deliverable_type_id)
select r.content_plan_item_id, r.profile_id, d.deliverable_type_id
from content_plan_responsibles r
join content_plan_deliverable_types d on d.content_plan_item_id = r.content_plan_item_id;

alter table content_plan_person_deliverable_types enable row level security;

create policy content_plan_person_deliverable_types_select on content_plan_person_deliverable_types for select using (
  exists (select 1 from content_plan_items cpi where cpi.id = content_plan_person_deliverable_types.content_plan_item_id)
);

create policy content_plan_person_deliverable_types_write on content_plan_person_deliverable_types for all using (
  is_ceo() or has_capability('projects.manage') or exists (
    select 1 from content_plan_items cpi
    where cpi.id = content_plan_person_deliverable_types.content_plan_item_id
      and (is_pm_of_project(cpi.project_id) or is_assistant_pm_of_project(cpi.project_id))
  )
);

create policy content_plan_person_deliverable_types_manager on content_plan_person_deliverable_types for all using (
  has_capability('content_plan.manage')
);
