-- "Иш тури мультиселект" -- a content-plan item can now have several work
-- types at once (carousel + reels + design + shoot, spelled out
-- individually) instead of exactly one format_id. content_plan_items.
-- format_id is kept as-is (still populated with the first selected format
-- for any code that hasn't been migrated to the junction) -- nothing
-- dropped, this is purely additive, same pattern as content_plan_platforms.
create table content_plan_formats (
  content_plan_item_id uuid not null references content_plan_items(id) on delete cascade,
  format_id uuid not null references content_formats(id),
  primary key (content_plan_item_id, format_id)
);

insert into content_plan_formats (content_plan_item_id, format_id)
select id, format_id from content_plan_items where format_id is not null;

alter table content_plan_formats enable row level security;

create policy content_plan_formats_select on content_plan_formats for select using (
  exists (select 1 from content_plan_items cpi where cpi.id = content_plan_formats.content_plan_item_id)
);

create policy content_plan_formats_write on content_plan_formats for all using (
  is_ceo() or has_capability('projects.manage') or exists (
    select 1 from content_plan_items cpi
    where cpi.id = content_plan_formats.content_plan_item_id
      and (is_pm_of_project(cpi.project_id) or is_assistant_pm_of_project(cpi.project_id))
  )
);

create policy content_plan_formats_manager on content_plan_formats for all using (
  has_capability('content_plan.manage')
);

-- Same projects.manage gap existed on the sibling junction table (platforms)
-- -- content_plan_write on the parent item already granted it, but the
-- per-junction write policy never did. Additive, mirrors the fix above.
create policy content_plan_platforms_management on content_plan_platforms for all using (
  has_capability('projects.manage')
);
