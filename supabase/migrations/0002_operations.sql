-- 0002_operations.sql
-- Stage 1 module: Projects, Tasks, Content plan, Checklists.

-- =========================================================================
-- Lookup tables for this module
-- =========================================================================

create table project_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- smm / target / ...
  label_ru text not null,
  label_uz text not null
);

create table project_statuses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- new / active / paused / done
  label_ru text not null,
  label_uz text not null,
  sort_order int not null default 0
);

create table task_statuses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- backlog / this_week / in_progress / review / done
  label_ru text not null,
  label_uz text not null,
  sort_order int not null default 0
);

create table priorities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- high / medium / low
  label_ru text not null,
  label_uz text not null,
  weight int not null default 0
);

create table recurrence_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- daily / weekly / monthly / one_time
  label_ru text not null,
  label_uz text not null
);

create table content_formats (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- reels / post / stories / video / fb_ads
  label_ru text not null,
  label_uz text not null
);

create table platforms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- ig / tg / yt / fb
  label_ru text not null,
  label_uz text not null
);

create table content_statuses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- plan / script / shoot / edit / ready / published
  label_ru text not null,
  label_uz text not null,
  sort_order int not null default 0
);

create table deliverable_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- reels_edit / post_design / shoot_session / ...
  label_ru text not null,
  label_uz text not null
);

create table checklist_cadences (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique -- daily / weekly / monthly
);

-- =========================================================================
-- Projects
-- =========================================================================

-- `clients` lives in 0003; projects.client_id is added there via ALTER
-- once `clients` exists, to keep migration ordering simple.
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department_id uuid references departments(id),
  project_type_id uuid not null references project_types(id),
  status_id uuid not null references project_statuses(id),
  pm_profile_id uuid not null references profiles(id),
  goal text,
  target_audience text,
  monthly_quota_posts int,
  monthly_quota_reels int,
  monthly_quota_stories int,
  monthly_quota_shoots int,
  billing_day int check (billing_day between 1 and 31),
  deliverables_text text,
  brief_detail_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- NOTE: no money columns here by design — money lives only in finance_* tables (0003).
  -- client_id references clients(id) is added in 0003 once `clients` exists.
);

create trigger trg_projects_updated_at
  before update on projects
  for each row execute function set_updated_at();

-- Defined here (not in 0001) because Postgres validates table references in
-- SQL-language functions at CREATE FUNCTION time, and `projects` didn't exist yet.
create or replace function is_pm_of_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects proj
    where proj.id = p_project_id and proj.pm_profile_id = auth_profile_id()
  );
$$;

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role_on_project text,
  primary key (project_id, profile_id)
);

-- See the NOTE above projects_select_member: this must be SECURITY DEFINER so
-- it bypasses project_members' own RLS when called from projects' policy
-- (and vice versa), instead of re-triggering it and recursing forever.
create or replace function is_project_member(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members pm
    where pm.project_id = p_project_id and pm.profile_id = auth_profile_id()
  );
$$;

-- =========================================================================
-- Content plan
-- =========================================================================

create table content_plan_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  topic text not null,
  format_id uuid not null references content_formats(id),
  script text,
  shooter_profile_id uuid references profiles(id),
  editor_profile_id uuid references profiles(id),
  responsible_profile_id uuid references profiles(id),
  shoot_date date,
  edit_done_date date,
  cover_done_date date,
  publish_date date,
  status_id uuid not null references content_statuses(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_content_plan_items_updated_at
  before update on content_plan_items
  for each row execute function set_updated_at();

create table content_plan_platforms (
  content_plan_item_id uuid not null references content_plan_items(id) on delete cascade,
  platform_id uuid not null references platforms(id),
  primary key (content_plan_item_id, platform_id)
);

-- =========================================================================
-- Tasks (general engine)
-- =========================================================================

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  project_id uuid references projects(id) on delete cascade,
  assignee_profile_id uuid references profiles(id),
  status_id uuid not null references task_statuses(id),
  priority_id uuid references priorities(id),
  is_urgent boolean not null default false,
  is_important boolean not null default false,
  recurrence_id uuid references recurrence_types(id),
  deadline timestamptz,
  percent_complete int not null default 0 check (percent_complete between 0 and 100),
  blocker_text text,
  deliverable_text text,
  content_plan_item_id uuid references content_plan_items(id),
  created_by uuid references profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_tasks_updated_at
  before update on tasks
  for each row execute function set_updated_at();

create table task_mentions (
  task_id uuid not null references tasks(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, profile_id)
);

create table task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_profile_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Checklists (daily / weekly / monthly)
-- =========================================================================

create table checklist_templates (
  id uuid primary key default gen_random_uuid(),
  cadence_id uuid not null references checklist_cadences(id),
  role_id uuid references roles(id), -- null = applies to all roles
  department_id uuid references departments(id),
  title text not null,
  applies_to_all boolean not null default false
);

create table checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  requires_note boolean not null default false
);

create table checklist_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates(id),
  profile_id uuid not null references profiles(id),
  period_date date not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (template_id, profile_id, period_date)
);

create table checklist_instance_items (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references checklist_instances(id) on delete cascade,
  template_item_id uuid not null references checklist_template_items(id),
  is_checked boolean not null default false,
  note text
);

-- =========================================================================
-- Views: smart task queue (Eisenhower + deadline-proximity sort) & workload
-- =========================================================================

create view v_task_queue with (security_invoker = true) as
select
  t.*,
  p.weight as priority_weight,
  case
    when t.deadline is null then 0
    when t.deadline <= now() then 100
    when t.deadline <= now() + interval '3 days' then 50
    else 0
  end as deadline_boost,
  coalesce(p.weight, 0) + (
    case
      when t.deadline is null then 0
      when t.deadline <= now() then 100
      when t.deadline <= now() + interval '3 days' then 50
      else 0
    end
  ) as sort_score
from tasks t
left join priorities p on p.id = t.priority_id
order by sort_score desc, t.deadline asc nulls last;

create view v_employee_workload with (security_invoker = true) as
select
  pr.id as profile_id,
  pr.full_name,
  pr.role_id,
  count(t.id) filter (
    where ts.slug not in ('done', 'backlog')
  ) as open_task_count,
  r.max_open_tasks,
  pr.workload_level_id
from profiles pr
left join tasks t on t.assignee_profile_id = pr.id
left join task_statuses ts on ts.id = t.status_id
left join roles r on r.id = pr.role_id
group by pr.id, pr.full_name, pr.role_id, r.max_open_tasks, pr.workload_level_id;

-- =========================================================================
-- RLS
-- =========================================================================

alter table project_types enable row level security;
alter table project_statuses enable row level security;
alter table task_statuses enable row level security;
alter table priorities enable row level security;
alter table recurrence_types enable row level security;
alter table content_formats enable row level security;
alter table platforms enable row level security;
alter table content_statuses enable row level security;
alter table deliverable_types enable row level security;
alter table checklist_cadences enable row level security;

alter table projects enable row level security;
alter table project_members enable row level security;
alter table content_plan_items enable row level security;
alter table content_plan_platforms enable row level security;
alter table tasks enable row level security;
alter table task_mentions enable row level security;
alter table task_comments enable row level security;
alter table checklist_templates enable row level security;
alter table checklist_template_items enable row level security;
alter table checklist_instances enable row level security;
alter table checklist_instance_items enable row level security;

-- Lookup tables: read for all authenticated, write for CEO only.
do $$
declare t text;
begin
  foreach t in array array[
    'project_types','project_statuses','task_statuses','priorities',
    'recurrence_types','content_formats','platforms','content_statuses',
    'deliverable_types','checklist_cadences'
  ] loop
    execute format('create policy %I_select on %I for select using (auth.uid() is not null);', t, t);
    execute format('create policy %I_write on %I for all using (is_ceo()) with check (is_ceo());', t, t);
  end loop;
end $$;

-- projects: CEO all; PM sees/manages their own projects; project members
-- (specialists) can read projects they're staffed on (needed for brief context),
-- but only PM/CEO can write.
-- NOTE: is_project_member() is defined further below (right after project_members
-- is created) and used here and by content_plan/tasks policies. Cross-table checks
-- MUST go through these SECURITY DEFINER helpers rather than raw EXISTS subqueries —
-- a raw subquery on project_members here plus a raw subquery on projects inside
-- project_members's own policy created infinite RLS recursion (Postgres error 42P17).
create policy projects_select_ceo on projects for select using (is_ceo());
create policy projects_select_pm on projects for select using (pm_profile_id = auth_profile_id());
create policy projects_select_member on projects for select using (
  is_project_member(id)
);
create policy projects_write_ceo on projects for all using (is_ceo()) with check (is_ceo());
create policy projects_write_pm on projects for update using (pm_profile_id = auth_profile_id())
  with check (pm_profile_id = auth_profile_id());
create policy projects_insert_pm on projects for insert with check (
  is_ceo() or has_capability('projects.manage')
);

create policy project_members_select on project_members for select using (
  is_ceo()
  or profile_id = auth_profile_id()
  or is_pm_of_project(project_id)
);
create policy project_members_write on project_members for all using (
  is_ceo() or is_pm_of_project(project_id)
) with check (
  is_ceo() or is_pm_of_project(project_id)
);

-- content_plan_items: CEO all; PM/scoped roles see whole project's plan;
-- specialists see only rows where they're shooter/editor/responsible.
create policy content_plan_select_ceo on content_plan_items for select using (is_ceo());
create policy content_plan_select_scoped on content_plan_items for select using (
  has_capability('projects.read_scoped') and (
    is_pm_of_project(project_id) or is_project_member(project_id)
  )
);
create policy content_plan_select_own on content_plan_items for select using (
  shooter_profile_id = auth_profile_id()
  or editor_profile_id = auth_profile_id()
  or responsible_profile_id = auth_profile_id()
);
create policy content_plan_write on content_plan_items for all using (
  is_ceo() or is_pm_of_project(project_id) or has_capability('projects.manage')
) with check (
  is_ceo() or is_pm_of_project(project_id) or has_capability('projects.manage')
);

create policy content_plan_platforms_select on content_plan_platforms for select using (
  exists (
    select 1 from content_plan_items cpi
    where cpi.id = content_plan_platforms.content_plan_item_id
  ) -- underlying content_plan_items RLS already restricts which rows are joinable
);
create policy content_plan_platforms_write on content_plan_platforms for all using (
  is_ceo() or exists (
    select 1 from content_plan_items cpi
    where cpi.id = content_plan_platforms.content_plan_item_id and is_pm_of_project(cpi.project_id)
  )
) with check (
  is_ceo() or exists (
    select 1 from content_plan_items cpi
    where cpi.id = content_plan_platforms.content_plan_item_id and is_pm_of_project(cpi.project_id)
  )
);

-- tasks: CEO all; PM sees all tasks in their own projects; specialists see
-- only tasks assigned to them.
create policy tasks_select_ceo on tasks for select using (is_ceo());
create policy tasks_select_pm_scoped on tasks for select using (
  project_id is not null and (
    is_pm_of_project(project_id)
    or (has_capability('projects.read_scoped') and is_project_member(project_id))
  )
);
create policy tasks_select_own on tasks for select using (assignee_profile_id = auth_profile_id());

create policy tasks_insert on tasks for insert with check (
  is_ceo() or (project_id is not null and is_pm_of_project(project_id)) or has_capability('projects.manage')
);
create policy tasks_update_management on tasks for update using (
  is_ceo() or (project_id is not null and is_pm_of_project(project_id)) or has_capability('projects.manage')
);
-- Assignee can update their own task's status/%/blocker (not reassign or delete).
create policy tasks_update_own on tasks for update using (
  assignee_profile_id = auth_profile_id()
) with check (
  assignee_profile_id = auth_profile_id()
);
create policy tasks_delete on tasks for delete using (
  is_ceo() or (project_id is not null and is_pm_of_project(project_id))
);

create policy task_mentions_select on task_mentions for select using (
  profile_id = auth_profile_id() or is_ceo() or exists (
    select 1 from tasks t where t.id = task_mentions.task_id and (
      t.assignee_profile_id = auth_profile_id()
      or (t.project_id is not null and is_pm_of_project(t.project_id))
    )
  )
);
create policy task_mentions_write on task_mentions for all using (
  is_ceo() or exists (
    select 1 from tasks t where t.id = task_mentions.task_id and (
      t.assignee_profile_id = auth_profile_id()
      or (t.project_id is not null and is_pm_of_project(t.project_id))
    )
  )
);

create policy task_comments_select on task_comments for select using (
  is_ceo() or exists (
    select 1 from tasks t where t.id = task_comments.task_id and (
      t.assignee_profile_id = auth_profile_id()
      or (t.project_id is not null and is_pm_of_project(t.project_id))
    )
  )
);
create policy task_comments_insert on task_comments for insert with check (
  author_profile_id = auth_profile_id() and (
    is_ceo() or exists (
      select 1 from tasks t where t.id = task_comments.task_id and (
        t.assignee_profile_id = auth_profile_id()
        or (t.project_id is not null and is_pm_of_project(t.project_id))
      )
    )
  )
);

-- checklists: templates readable by all, writable by CEO; instances/items
-- visible+editable by their owner, readable (not writable) by CEO/PM for review.
create policy checklist_templates_select on checklist_templates for select using (auth.uid() is not null);
create policy checklist_templates_write on checklist_templates for all using (is_ceo()) with check (is_ceo());
create policy checklist_template_items_select on checklist_template_items for select using (auth.uid() is not null);
create policy checklist_template_items_write on checklist_template_items for all using (is_ceo()) with check (is_ceo());

create policy checklist_instances_select_own on checklist_instances for select using (profile_id = auth_profile_id());
create policy checklist_instances_select_management on checklist_instances for select using (
  is_ceo() or has_capability('cabinets.read_all')
);
create policy checklist_instances_write_own on checklist_instances for update using (profile_id = auth_profile_id())
  with check (profile_id = auth_profile_id());
create policy checklist_instances_insert_system on checklist_instances for insert with check (
  is_ceo() -- normal creation happens via pg_cron job running as service role (bypasses RLS)
);

create policy checklist_instance_items_select on checklist_instance_items for select using (
  exists (
    select 1 from checklist_instances ci where ci.id = checklist_instance_items.instance_id
    and (ci.profile_id = auth_profile_id() or is_ceo() or has_capability('cabinets.read_all'))
  )
);
create policy checklist_instance_items_write_own on checklist_instance_items for update using (
  exists (
    select 1 from checklist_instances ci where ci.id = checklist_instance_items.instance_id
    and ci.profile_id = auth_profile_id()
  )
) with check (
  exists (
    select 1 from checklist_instances ci where ci.id = checklist_instance_items.instance_id
    and ci.profile_id = auth_profile_id()
  )
);
