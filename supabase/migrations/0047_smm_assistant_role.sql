-- 0047_smm_assistant_role.sql
-- New role: SMM manager's assistant. Full access to the content plan
-- (every project, not just ones they're tagged/member on) but nothing else
-- beyond an ordinary employee's baseline -- a new capability scoped to just
-- that, rather than reusing 'projects.manage' (which also grants managing
-- projects/tasks broadly).

insert into roles (slug, label_ru, label_uz, is_management, max_open_tasks) values
  ('smm_assistant', 'SMM менеджер ёрдамчиси', 'SMM menejer yordamchisi', false, 3)
on conflict (slug) do nothing;

insert into role_capabilities (role_id, capability)
select id, 'content_plan.manage' from roles where slug = 'smm_assistant'
on conflict do nothing;

-- content_plan_items: same shape as the existing scoped/own policies --
-- additive, doesn't touch what CEO/PM/tagged people can already do.
create policy content_plan_select_manager on content_plan_items for select using (
  has_capability('content_plan.manage')
);
create policy content_plan_write_manager on content_plan_items for all using (
  has_capability('content_plan.manage')
) with check (
  has_capability('content_plan.manage')
);

create policy content_plan_platforms_manager on content_plan_platforms for all using (
  has_capability('content_plan.manage')
) with check (
  has_capability('content_plan.manage')
);
