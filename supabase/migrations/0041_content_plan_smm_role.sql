-- 0041_content_plan_smm_role.sql
-- SMM is sometimes the one actually responsible for a content-plan item
-- (not just shooter/editor) -- add a fourth taggable role so they can be
-- assigned and see/get reminded about their own items, same as the other
-- three ("за всё где он отмечен").

alter table content_plan_items add column smm_profile_id uuid references profiles(id);

drop policy if exists content_plan_select_own on content_plan_items;
create policy content_plan_select_own on content_plan_items for select using (
  shooter_profile_id = auth_profile_id()
  or editor_profile_id = auth_profile_id()
  or responsible_profile_id = auth_profile_id()
  or smm_profile_id = auth_profile_id()
);
