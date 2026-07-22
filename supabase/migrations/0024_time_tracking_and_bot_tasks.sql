-- 0024_time_tracking_and_bot_tasks.sql
-- Three features requested together: (1) start/stop work-time tracking per
-- employee, timestamp-based so it survives closing the browser/PC and works
-- correctly across devices on the same account; (2) a flag so tasks created
-- by the CEO through the Telegram bot are visibly marked as such; (3) a
-- small state table so the bot can run multi-step conversations (pick
-- employee -> enter task -> pick deadline) across separate webhook calls,
-- since each Telegram update arrives as an independent HTTP request.

-- =========================================================================
-- A. Time tracking
-- =========================================================================

create table time_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  started_device text,
  ended_device text,
  created_at timestamptz not null default now()
);

-- One open (not-yet-stopped) entry per person at a time. This is what makes
-- the multi-device case safe: starting on a laptop and later opening the
-- app on a phone under the same account sees the SAME open row (queried by
-- profile_id), so "Stop" from either device closes the one true session
-- instead of creating a conflicting second timer.
create unique index time_entries_one_open_per_profile
  on time_entries (profile_id)
  where ended_at is null;

alter table time_entries enable row level security;

create policy time_entries_select_own on time_entries
  for select using (profile_id = auth_profile_id());

create policy time_entries_select_ceo on time_entries
  for select using (is_ceo());

create policy time_entries_insert_own on time_entries
  for insert with check (profile_id = auth_profile_id());

create policy time_entries_update_own on time_entries
  for update using (profile_id = auth_profile_id())
  with check (profile_id = auth_profile_id());

-- =========================================================================
-- B. Bot-assigned tasks
-- =========================================================================

alter table tasks add column created_via_telegram boolean not null default false;

-- v_task_queue's "t.*" is expanded to a fixed column list at view-creation
-- time, so it won't pick up the new column on its own -- recreate it
-- (same body as 0018_manual_eisenhower_and_cleanup.sql) so CabinetPage's
-- `select('*')` against this view actually returns created_via_telegram.
drop view if exists v_task_queue;
create view v_task_queue with (security_invoker = true) as
select
  t.*,
  tt.weight as term_weight,
  case
    when t.deadline is null then 0
    when t.deadline <= now() then 100
    when t.deadline <= now() + interval '3 days' then 50
    else 0
  end as deadline_boost,
  coalesce(pq.weight, 0)
  + (
    case
      when t.deadline is null then 0
      when t.deadline <= now() then 100
      when t.deadline <= now() + interval '3 days' then 50
      else 0
    end
  ) as sort_score
from tasks t
left join task_term_types tt on tt.id = t.term_type_id
left join task_priority_quadrants pq on pq.id = t.quadrant_id
order by sort_score desc, t.deadline asc nulls last;

-- =========================================================================
-- C. Bot conversation state (service-role only; the edge function is the
--    only thing that ever touches this table, so RLS is enabled with no
--    policies at all -- deny-by-default for any authenticated client).
-- =========================================================================

create table bot_conversation_state (
  chat_id bigint primary key,
  state text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table bot_conversation_state enable row level security;

-- =========================================================================
-- D. has_capability_for_profile: the bot runs under the service role (no
--    auth.uid() JWT context), so it can't call has_capability()/is_ceo()
--    directly. This mirrors has_capability()'s override-then-role logic but
--    takes a profile id instead of reading it from the current session.
-- =========================================================================

create or replace function has_capability_for_profile(p_profile_id uuid, p_capability text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select granted
      from profile_capability_overrides pco
      where pco.profile_id = p_profile_id and pco.capability = p_capability
    ),
    exists (
      select 1
      from profiles p
      join role_capabilities rc on rc.role_id = p.role_id
      where p.id = p_profile_id and rc.capability = p_capability
    )
  );
$$;
