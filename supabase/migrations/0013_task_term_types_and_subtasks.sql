-- 0013_task_term_types_and_subtasks.sql
-- Two problems reported by the client after a week of real use:
--
-- 1. "Срочно"/"Важно" (is_urgent/is_important) checkboxes confused staff —
--    nobody understood what "urgent" vs "important" meant in practice. They
--    also overlapped confusingly with a SEPARATE flat priority_id dropdown
--    (Высокий/Средний/Низкий) that actually drove v_task_queue.sort_score —
--    is_urgent/is_important were UI-only and never fed the sort at all.
--
-- 2. tasks.percent_complete was a bare manually-entered integer with no UI
--    to edit it and no way to break a task into sub-items — the client asked
--    for real subtasks that roll up into a progress bar.
--
-- Fix: replace the urgent/important checkboxes with a single, concrete
-- "muddat toifasi" (deadline-term) pick — qisqa/o'rta/uzoq muddatli, mapped
-- to day ranges everyone understands. is_important survives as one clear
-- toggle. The two combine into a proper Eisenhower quadrant (computed, not
-- manually chosen) which replaces the flat priority_id dropdown in sort_score.
-- priority_id/priorities are left in the schema untouched for backward
-- compatibility with old rows, just no longer driven from new UI.

create table task_term_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- qisqa / orta / uzoq
  label_ru text not null,
  label_uz text not null,
  day_min int not null,
  day_max int not null,
  weight int not null,
  sort_order int not null default 0
);

alter table task_term_types enable row level security;
create policy task_term_types_select on task_term_types for select using (auth.uid() is not null);
create policy task_term_types_write on task_term_types for all using (is_ceo()) with check (is_ceo());

insert into task_term_types (slug, label_ru, label_uz, day_min, day_max, weight, sort_order) values
  ('qisqa', 'Краткосрочная (1-3 дня)', 'Qisqa muddatli (1-3 kun)', 1, 3, 30, 1),
  ('orta', 'Среднесрочная (1-10 дней)', 'Orta muddatli (1-10 kun)', 1, 10, 20, 2),
  ('uzoq', 'Долгосрочная (10-15 дней)', 'Uzoq muddatli (10-15 kun)', 10, 15, 10, 3);

alter table tasks add column term_type_id uuid references task_term_types(id);
alter table tasks add column starts_at timestamptz;

-- Backfill: old is_urgent -> qisqa, everything else -> orta (reasonable
-- default; CEO/PM can correct per-task afterward).
update tasks set term_type_id = (
  select id from task_term_types where slug = case when is_urgent then 'qisqa' else 'orta' end
);

-- Recompute sort_score from term_type weight + is_important bonus + deadline
-- proximity, replacing the old priority.weight-driven version.
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
  coalesce(tt.weight, 0)
  + (case when t.is_important then 15 else 0 end)
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
order by sort_score desc, t.deadline asc nulls last;

-- =========================================================================
-- Subtasks (checklist items inside a task, roll up into percent_complete)
-- =========================================================================

create table task_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table task_items enable row level security;

-- Mirrors tasks visibility: whoever can see the parent task can see/manage
-- its subtasks (assignee, PM of the project, or CEO).
create policy task_items_select on task_items for select using (
  exists (
    select 1 from tasks t where t.id = task_items.task_id and (
      is_ceo()
      or t.assignee_profile_id = auth_profile_id()
      or (t.project_id is not null and is_pm_of_project(t.project_id))
    )
  )
);
create policy task_items_write on task_items for all using (
  exists (
    select 1 from tasks t where t.id = task_items.task_id and (
      is_ceo()
      or t.assignee_profile_id = auth_profile_id()
      or (t.project_id is not null and is_pm_of_project(t.project_id))
    )
  )
) with check (
  exists (
    select 1 from tasks t where t.id = task_items.task_id and (
      is_ceo()
      or t.assignee_profile_id = auth_profile_id()
      or (t.project_id is not null and is_pm_of_project(t.project_id))
    )
  )
);

create or replace function recompute_task_percent_complete()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  affected_task_id uuid;
  total int;
  done int;
begin
  affected_task_id := coalesce(new.task_id, old.task_id);

  select count(*), count(*) filter (where is_done)
    into total, done
    from task_items where task_id = affected_task_id;

  if total > 0 then
    update tasks set percent_complete = round(done::numeric / total * 100) where id = affected_task_id;
  end if;

  return null;
end;
$$;

create trigger trg_task_items_percent_complete
  after insert or update or delete on task_items
  for each row execute function recompute_task_percent_complete();
