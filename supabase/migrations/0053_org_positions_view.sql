-- 0053_org_positions_view.sql
-- The org chart (OrgStructurePage) is meant to be visible company-wide --
-- it's who-reports-to-whom, not sensitive data. But it was resolving names
-- via a plain `select ... from profiles`, which is RLS-locked to your own
-- row unless you're CEO/finance/cabinets.read_all (profiles_select_* on
-- 0011/0019/etc) -- so any employee without one of those capabilities saw
-- every position, including their own, rendered as "Вакансия" (vacant),
-- since the name lookup came back empty for everyone but themselves.
--
-- Fix: a security_invoker=false view that joins the name in server-side,
-- gated only on being logged in at all (not any elevated capability) --
-- matches the intended "everyone can see the chart" visibility.

create view v_org_positions with (security_invoker = false) as
select
  op.id,
  op.title,
  op.parent_position_id,
  op.profile_id,
  pr.full_name,
  pr.avatar_url
from org_positions op
left join profiles pr on pr.id = op.profile_id
where auth.uid() is not null;
