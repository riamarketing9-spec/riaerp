-- Correction: "Иш тури" (per the CEO) is deliverable_types (Reels montaji,
-- Post dizayni, Syomka, Design post, Design cover, Karusel, ...) -- NOT
-- content_formats, which 0065 mistakenly multiselected. content_formats
-- stays a single select (it's a different, legitimate field: publish
-- format). This mirrors 0065's junction pattern but against the correct
-- table, and mirrors the existing task_deliverable_types junction (0017)
-- used the same way on tasks.
create table content_plan_deliverable_types (
  content_plan_item_id uuid not null references content_plan_items(id) on delete cascade,
  deliverable_type_id uuid not null references deliverable_types(id),
  primary key (content_plan_item_id, deliverable_type_id)
);

insert into content_plan_deliverable_types (content_plan_item_id, deliverable_type_id)
select id, deliverable_type_id from content_plan_items where deliverable_type_id is not null;

alter table content_plan_deliverable_types enable row level security;

create policy content_plan_deliverable_types_select on content_plan_deliverable_types for select using (
  exists (select 1 from content_plan_items cpi where cpi.id = content_plan_deliverable_types.content_plan_item_id)
);

create policy content_plan_deliverable_types_write on content_plan_deliverable_types for all using (
  is_ceo() or has_capability('projects.manage') or exists (
    select 1 from content_plan_items cpi
    where cpi.id = content_plan_deliverable_types.content_plan_item_id
      and (is_pm_of_project(cpi.project_id) or is_assistant_pm_of_project(cpi.project_id))
  )
);

create policy content_plan_deliverable_types_manager on content_plan_deliverable_types for all using (
  has_capability('content_plan.manage')
);
