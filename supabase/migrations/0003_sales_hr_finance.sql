-- 0003_sales_hr_finance.sql
-- Stage 2/3 modules: Sales/CRM, HR documents, Contracts, Finance/Payroll, KPI views, Notifications.
-- Schema + RLS created now per the client's staged-rollout requirement (schema up front, UI later).

-- =========================================================================
-- Lookup tables
-- =========================================================================

create table industries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label_ru text not null,
  label_uz text not null
);

create table client_statuses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- potential / active / lost
  label_ru text not null,
  label_uz text not null
);

create table lead_stages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- contact / meeting / proposal / contract
  label_ru text not null,
  label_uz text not null,
  sort_order int not null default 0
);

create table document_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- hr / instruction / policy
  label_ru text not null,
  label_uz text not null
);

create table contract_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique -- client / employee
);

create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label_ru text not null,
  label_uz text not null
);

create table expense_scopes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique -- business / personal
);

-- =========================================================================
-- Sales / CRM
-- =========================================================================

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_phone text,
  contact_telegram text,
  industry_id uuid references industries(id),
  status_id uuid not null references client_statuses(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

-- Now that `clients` exists, link it to `projects` (created in 0002).
alter table projects add column client_id uuid references clients(id);

create table leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  stage_id uuid not null references lead_stages(id),
  owner_profile_id uuid references profiles(id),
  expected_value numeric, -- sales estimate only, not a finance actual
  next_action_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_leads_updated_at
  before update on leads
  for each row execute function set_updated_at();

-- =========================================================================
-- HR documents / contracts
-- =========================================================================

create table documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  storage_path text not null,
  category_id uuid references document_categories(id),
  uploaded_by uuid references profiles(id),
  is_org_wide boolean not null default false,
  created_at timestamptz not null default now()
);

create table document_visibility (
  document_id uuid not null references documents(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  granted_by uuid references profiles(id),
  granted_at timestamptz not null default now(),
  primary key (document_id, profile_id)
);

create table contracts (
  id uuid primary key default gen_random_uuid(),
  contract_type_id uuid not null references contract_types(id),
  party_client_id uuid references clients(id),
  party_profile_id uuid references profiles(id),
  storage_path text not null,
  start_date date,
  end_date date,
  status text,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Finance (strictest RLS: CEO + financier only, no policies for anyone else)
-- =========================================================================

create table finance_project_revenue (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  month date not null,
  amount numeric not null,
  created_at timestamptz not null default now(),
  unique (project_id, month)
);

create table finance_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  amount numeric not null,
  category_id uuid references expense_categories(id),
  scope_id uuid not null references expense_scopes(id),
  project_id uuid references projects(id),
  note text,
  receipt_storage_path text,
  created_at timestamptz not null default now()
);

create table payroll_rate_table (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  deliverable_type_id uuid not null references deliverable_types(id),
  rate numeric not null,
  effective_from date not null,
  effective_to date
);

create table payroll_fixed_salary (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  monthly_amount numeric not null,
  effective_from date not null,
  effective_to date
);

create table payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  generated_at timestamptz not null default now(),
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  unique (period_month)
);

create table payroll_run_lines (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  fixed_component numeric not null default 0,
  piece_rate_component numeric not null default 0,
  total numeric not null default 0,
  detail_json jsonb
);

-- =========================================================================
-- Notifications / export audit
-- =========================================================================

create table notification_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  channel text not null default 'telegram',
  type text not null, -- deadline_reminder / mention / missed_deadline
  related_task_id uuid references tasks(id),
  sent_at timestamptz not null default now(),
  payload_json jsonb
);

create table export_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  requested_at timestamptz not null default now(),
  status text not null default 'completed'
);

-- =========================================================================
-- KPI views
-- =========================================================================

create view v_employee_kpi with (security_invoker = true) as
select
  pr.id as profile_id,
  pr.full_name,
  count(t.id) filter (where ts.slug = 'done') as tasks_completed,
  count(t.id) filter (where ts.slug = 'done' and t.completed_at <= t.deadline) as tasks_on_time,
  avg(t.percent_complete) as avg_percent_complete
from profiles pr
left join tasks t on t.assignee_profile_id = pr.id
left join task_statuses ts on ts.id = t.status_id
group by pr.id, pr.full_name;

create view v_project_kpi with (security_invoker = true) as
select
  proj.id as project_id,
  proj.name,
  avg(t.percent_complete) as avg_task_percent_complete,
  count(cpi.id) filter (where cs.slug = 'published' and date_trunc('month', cpi.publish_date) = date_trunc('month', now())) as content_published_this_month
from projects proj
left join tasks t on t.project_id = proj.id
left join content_plan_items cpi on cpi.project_id = proj.id
left join content_statuses cs on cs.id = cpi.status_id
group by proj.id, proj.name;

-- Finance-bearing view; security_invoker means it still respects the caller's
-- RLS on finance_project_revenue/finance_expenses (base tables restrict to CEO/financier).
create view v_project_profit with (security_invoker = true) as
select
  proj.id as project_id,
  proj.name,
  coalesce(sum(rev.amount), 0) as total_revenue,
  coalesce(sum(exp.amount), 0) as total_expenses,
  coalesce(sum(rev.amount), 0) - coalesce(sum(exp.amount), 0) as profit
from projects proj
left join finance_project_revenue rev on rev.project_id = proj.id
left join finance_expenses exp on exp.project_id = proj.id
group by proj.id, proj.name;

create view v_ceo_dashboard with (security_invoker = true) as
select
  (select coalesce(sum(amount), 0) from finance_project_revenue where month = date_trunc('month', now())::date) as mrr,
  (select count(*) from projects proj join project_statuses ps on ps.id = proj.status_id where ps.slug = 'active') as active_projects,
  (select count(*) from tasks where deadline < now() and status_id not in (select id from task_statuses where slug = 'done')) as overdue_tasks,
  (select count(*) from v_employee_workload where open_task_count > max_open_tasks) as overloaded_employees;

-- =========================================================================
-- RLS
-- =========================================================================

alter table industries enable row level security;
alter table client_statuses enable row level security;
alter table lead_stages enable row level security;
alter table document_categories enable row level security;
alter table contract_types enable row level security;
alter table expense_categories enable row level security;
alter table expense_scopes enable row level security;

alter table clients enable row level security;
alter table leads enable row level security;
alter table documents enable row level security;
alter table document_visibility enable row level security;
alter table contracts enable row level security;

alter table finance_project_revenue enable row level security;
alter table finance_expenses enable row level security;
alter table payroll_rate_table enable row level security;
alter table payroll_fixed_salary enable row level security;
alter table payroll_runs enable row level security;
alter table payroll_run_lines enable row level security;

alter table notification_log enable row level security;
alter table export_log enable row level security;

-- Lookup tables: read for all authenticated, write for CEO.
do $$
declare t text;
begin
  foreach t in array array[
    'industries','client_statuses','lead_stages','document_categories',
    'contract_types','expense_categories','expense_scopes'
  ] loop
    execute format('create policy %I_select on %I for select using (auth.uid() is not null);', t, t);
    execute format('create policy %I_write on %I for all using (is_ceo()) with check (is_ceo());', t, t);
  end loop;
end $$;

-- clients / leads: CEO all; sales/PM roles see clients & leads they own or
-- that are linked to their projects; specialists get no policy at all (no access).
create policy clients_select_ceo on clients for select using (is_ceo());
create policy clients_select_sales on clients for select using (
  has_capability('sales.read') and (
    exists (select 1 from leads l where l.client_id = clients.id and l.owner_profile_id = auth_profile_id())
    or exists (select 1 from projects proj where proj.client_id = clients.id and proj.pm_profile_id = auth_profile_id())
  )
);
create policy clients_write on clients for all using (
  is_ceo() or has_capability('sales.manage')
) with check (
  is_ceo() or has_capability('sales.manage')
);

create policy leads_select_ceo on leads for select using (is_ceo());
create policy leads_select_owner on leads for select using (
  has_capability('sales.read') and owner_profile_id = auth_profile_id()
);
create policy leads_write on leads for all using (
  is_ceo() or has_capability('sales.manage')
) with check (
  is_ceo() or has_capability('sales.manage')
);

-- documents: org-wide docs visible to all; otherwise only explicit grants or CEO.
create policy documents_select on documents for select using (
  is_org_wide
  or is_ceo()
  or exists (select 1 from document_visibility dv where dv.document_id = documents.id and dv.profile_id = auth_profile_id())
);
create policy documents_write on documents for all using (is_ceo()) with check (is_ceo());

create policy document_visibility_select on document_visibility for select using (
  is_ceo() or profile_id = auth_profile_id()
);
create policy document_visibility_write on document_visibility for all using (is_ceo()) with check (is_ceo());

-- contracts: CEO always; PM sees client contracts for their own projects'
-- clients; employees see only their own employment contract row.
create policy contracts_select_ceo on contracts for select using (is_ceo());
create policy contracts_select_pm on contracts for select using (
  party_client_id is not null and exists (
    select 1 from projects proj where proj.client_id = contracts.party_client_id and proj.pm_profile_id = auth_profile_id()
  )
);
create policy contracts_select_own on contracts for select using (
  party_profile_id = auth_profile_id()
);
create policy contracts_write on contracts for all using (is_ceo()) with check (is_ceo());

-- finance_*: CEO or financier ONLY. No other policies exist for any other role.
create policy finance_project_revenue_all on finance_project_revenue for all
  using (is_ceo() or is_finance()) with check (is_ceo() or is_finance());
create policy finance_expenses_all on finance_expenses for all
  using (is_ceo() or is_finance()) with check (is_ceo() or is_finance());
create policy payroll_rate_table_all on payroll_rate_table for all
  using (is_ceo() or is_finance()) with check (is_ceo() or is_finance());
create policy payroll_fixed_salary_all on payroll_fixed_salary for all
  using (is_ceo() or is_finance()) with check (is_ceo() or is_finance());
create policy payroll_runs_select on payroll_runs for select
  using (is_ceo() or is_finance());
create policy payroll_runs_insert on payroll_runs for insert
  with check (is_ceo() or is_finance());
create policy payroll_runs_update on payroll_runs for update
  using ((is_ceo() or is_finance()) and status = 'draft')
  with check (is_ceo() or is_finance());
create policy payroll_run_lines_all on payroll_run_lines for all
  using (is_ceo() or is_finance()) with check (is_ceo() or is_finance());

-- notifications: own log entries readable by self, all by CEO; writes come
-- from Edge Functions using the service role (bypasses RLS).
create policy notification_log_select_own on notification_log for select using (
  profile_id = auth_profile_id() or is_ceo()
);

-- export_log: users see their own export history; CEO sees all (audit trail).
create policy export_log_select_own on export_log for select using (
  profile_id = auth_profile_id() or is_ceo()
);
create policy export_log_insert_own on export_log for insert with check (
  profile_id = auth_profile_id()
);
