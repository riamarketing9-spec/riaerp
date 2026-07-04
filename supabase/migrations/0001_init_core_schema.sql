-- 0001_init_core_schema.sql
-- Core identity, org structure, lookup tables, and RLS helper functions.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================================
-- Lookup tables (data-driven instead of hardcoded enums, per scalability req)
-- =========================================================================

create table departments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label_ru text not null,
  label_uz text not null,
  created_at timestamptz not null default now()
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label_ru text not null,
  label_uz text not null,
  is_management boolean not null default false,
  max_open_tasks int not null default 3,
  created_at timestamptz not null default now()
);

create table role_capabilities (
  role_id uuid not null references roles(id) on delete cascade,
  capability text not null,
  primary key (role_id, capability)
);

create table staff_statuses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- active / trainee / inactive
  label_ru text not null,
  label_uz text not null
);

create table workload_levels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- light / normal / busy
  label_ru text not null,
  label_uz text not null,
  color text not null,
  sort_order int not null default 0
);

-- =========================================================================
-- Identity / org structure
-- =========================================================================

create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  telegram_chat_id text,
  role_id uuid not null references roles(id),
  department_id uuid references departments(id),
  staff_status_id uuid references staff_statuses(id),
  workload_level_id uuid references workload_levels(id),
  hire_date date,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Secondary/informational roles a person can also perform (filtering only,
-- primary role on `profiles` is what RLS/capabilities key off of).
create table employee_roles (
  profile_id uuid not null references profiles(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  primary key (profile_id, role_id)
);

-- Org chart position tree, deliberately decoupled from the operational role
-- system (a person's org *position* is not their ERP *role/capability*).
create table org_positions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  parent_position_id uuid references org_positions(id),
  profile_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user is provisioned.
-- Staff accounts are created by the CEO via an Edge Function using the
-- admin API; this trigger just back-fills the profiles row skeleton.
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (auth_user_id, full_name, role_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    (select id from roles where slug = coalesce(new.raw_user_meta_data->>'role_slug', 'shogird') limit 1)
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- =========================================================================
-- RLS helper functions
-- =========================================================================

create or replace function auth_profile_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from profiles where auth_user_id = auth.uid();
$$;

create or replace function current_role_slug()
returns text language sql stable security definer set search_path = public as $$
  select r.slug
  from profiles p
  join roles r on r.id = p.role_id
  where p.auth_user_id = auth.uid();
$$;

create or replace function has_capability(cap text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from profiles p
    join role_capabilities rc on rc.role_id = p.role_id
    where p.auth_user_id = auth.uid() and rc.capability = cap
  );
$$;

create or replace function is_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select has_capability('org.full_access');
$$;

create or replace function is_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select has_capability('finance.read');
$$;

-- NOTE: is_pm_of_project() is defined in migration 0002, right after the
-- `projects` table is created (Postgres validates table references in SQL-
-- language functions at CREATE FUNCTION time, so it can't be defined here yet).

create or replace function owns_cabinet(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_profile_id = auth_profile_id();
$$;

-- =========================================================================
-- RLS on tables defined in this migration
-- =========================================================================

alter table departments enable row level security;
alter table roles enable row level security;
alter table role_capabilities enable row level security;
alter table staff_statuses enable row level security;
alter table workload_levels enable row level security;
alter table profiles enable row level security;
alter table employee_roles enable row level security;
alter table org_positions enable row level security;

-- Lookup tables: readable by any authenticated user, writable only by CEO.
create policy departments_select on departments for select using (auth.uid() is not null);
create policy departments_write on departments for all using (is_ceo()) with check (is_ceo());

create policy roles_select on roles for select using (auth.uid() is not null);
create policy roles_write on roles for all using (is_ceo()) with check (is_ceo());

create policy role_capabilities_select on role_capabilities for select using (auth.uid() is not null);
create policy role_capabilities_write on role_capabilities for all using (is_ceo()) with check (is_ceo());

create policy staff_statuses_select on staff_statuses for select using (auth.uid() is not null);
create policy staff_statuses_write on staff_statuses for all using (is_ceo()) with check (is_ceo());

create policy workload_levels_select on workload_levels for select using (auth.uid() is not null);
create policy workload_levels_write on workload_levels for all using (is_ceo()) with check (is_ceo());

-- profiles: everyone can see their own row; CEO/PM see everyone (PM needs to
-- assign tasks to anyone); a specialist only sees their own profile row.
create policy profiles_select_own on profiles
  for select using (auth_user_id = auth.uid());

create policy profiles_select_management on profiles
  for select using (is_ceo() or has_capability('cabinets.read_all'));

create policy profiles_update_own on profiles
  for update using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

create policy profiles_write_ceo on profiles
  for all using (is_ceo()) with check (is_ceo());

create policy employee_roles_select on employee_roles
  for select using (
    profile_id = auth_profile_id() or is_ceo() or has_capability('cabinets.read_all')
  );
create policy employee_roles_write on employee_roles
  for all using (is_ceo()) with check (is_ceo());

create policy org_positions_select on org_positions
  for select using (auth.uid() is not null);
create policy org_positions_write on org_positions
  for all using (is_ceo()) with check (is_ceo());
