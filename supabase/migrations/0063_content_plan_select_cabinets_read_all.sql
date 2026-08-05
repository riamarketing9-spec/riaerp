-- KpiReportsPage gates on cabinets.read_all and queries content_plan_items,
-- but content_plan's SELECT policies only recognize content_plan.manage,
-- not cabinets.read_all -- a pure cabinets.read_all holder got zero
-- content-plan rows in the KPI report.
create policy content_plan_select_cabinets_read_all on content_plan_items for select using (
  has_capability('cabinets.read_all')
);
