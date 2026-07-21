-- 0019_pm_capability_expansion.sql
--
-- Client asked for PM to also be able to: add clients, edit org structure,
-- manage documents, add knowledge-base articles. Plus two new free-text
-- content-plan fields ("рубрика"/"цель видео"), and dropping the
-- max_open_tasks-driven "overloaded_employees" stat from the CEO dashboard
-- (the WIP limit concept is being removed from the UI in this round).

-- =========================================================================
-- A. content_plan_items: rubric ("рубрика") + video_goal ("цель видео")
-- =========================================================================
alter table content_plan_items add column if not exists rubric text;
alter table content_plan_items add column if not exists video_goal text;

-- =========================================================================
-- B. Grant PM: sales.manage (clients), docs.admin (documents + KB — this
--    slug already existed in the ceo seed row but no policy ever checked
--    it), and a new org.structure_manage (deliberately NOT org.full_access,
--    which would make PM CEO-equivalent everywhere is_ceo() is checked).
-- =========================================================================
insert into role_capabilities (role_id, capability)
select r.id, c.capability
from roles r
cross join (values ('sales.manage'), ('docs.admin'), ('org.structure_manage')) as c(capability)
where r.slug = 'pm'
on conflict do nothing;

-- =========================================================================
-- C. org_positions_write: was is_ceo() only -> also org.structure_manage.
-- =========================================================================
drop policy if exists org_positions_write on org_positions;
create policy org_positions_write on org_positions for all using (
  is_ceo() or has_capability('org.structure_manage')
) with check (
  is_ceo() or has_capability('org.structure_manage')
);

-- =========================================================================
-- D. documents_write / document_visibility_write: was is_ceo() only ->
--    also docs.admin.
-- =========================================================================
drop policy if exists documents_write on documents;
create policy documents_write on documents for all using (
  is_ceo() or has_capability('docs.admin')
) with check (
  is_ceo() or has_capability('docs.admin')
);

drop policy if exists document_visibility_write on document_visibility;
create policy document_visibility_write on document_visibility for all using (
  is_ceo() or has_capability('docs.admin')
) with check (
  is_ceo() or has_capability('docs.admin')
);

-- =========================================================================
-- E. kb_articles_write: was is_ceo() only -> also docs.admin.
-- =========================================================================
drop policy if exists kb_articles_write on kb_articles;
create policy kb_articles_write on kb_articles for all using (
  is_ceo() or has_capability('docs.admin')
) with check (
  is_ceo() or has_capability('docs.admin')
);

-- clients_write already checks has_capability('sales.manage') (0003) — no
-- RLS change needed there, PM just needed the capability grant above.

-- =========================================================================
-- F. v_ceo_dashboard: drop overloaded_employees (max_open_tasks is being
--    de-emphasized app-wide per the client's request — "просто количество,
--    без цвета"). Identical to the 0011 definition minus that one column.
-- =========================================================================
drop view if exists v_ceo_dashboard;
create view v_ceo_dashboard with (security_invoker = true) as
select
  (select coalesce(sum(amount), 0) from finance_project_revenue where month = date_trunc('month', now())::date) as mrr,
  (select count(*) from projects proj join project_statuses ps on ps.id = proj.status_id where ps.slug = 'active') as active_projects,
  (select count(*) from tasks where deadline < now() and status_id not in (select id from task_statuses where slug = 'done')) as overdue_tasks;
