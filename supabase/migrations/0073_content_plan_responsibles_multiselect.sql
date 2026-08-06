-- "Ответственный" becomes a multiselect: several people can be assigned
-- to one content-plan item, not just one. responsible_profile_id (and the
-- older shooter/editor/smm columns) are kept as-is, untouched -- this is
-- purely additive, same junction pattern as content_plan_formats/
-- content_plan_deliverable_types.
create table content_plan_responsibles (
  content_plan_item_id uuid not null references content_plan_items(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  primary key (content_plan_item_id, profile_id)
);

insert into content_plan_responsibles (content_plan_item_id, profile_id)
select id, coalesce(responsible_profile_id, shooter_profile_id, editor_profile_id, smm_profile_id)
from content_plan_items
where coalesce(responsible_profile_id, shooter_profile_id, editor_profile_id, smm_profile_id) is not null;

alter table content_plan_responsibles enable row level security;

create policy content_plan_responsibles_select on content_plan_responsibles for select using (
  exists (select 1 from content_plan_items cpi where cpi.id = content_plan_responsibles.content_plan_item_id)
);

create policy content_plan_responsibles_write on content_plan_responsibles for all using (
  is_ceo() or has_capability('projects.manage') or exists (
    select 1 from content_plan_items cpi
    where cpi.id = content_plan_responsibles.content_plan_item_id
      and (is_pm_of_project(cpi.project_id) or is_assistant_pm_of_project(cpi.project_id))
  )
);

create policy content_plan_responsibles_manager on content_plan_responsibles for all using (
  has_capability('content_plan.manage')
);
