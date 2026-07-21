-- 0018_manual_eisenhower_and_cleanup.sql
--
-- Client feedback after using the round-6 auto-computed Eisenhower badge:
-- they want to PICK the quadrant themselves (4 buttons, like the reference
-- screenshot), not have it silently computed from term_type+deadline. Also:
-- task_statuses had two confusing entries ("Бэклог" — nobody understood it,
-- "На этой неделе" — irrelevant, should just go away), and the deliverable
-- type "Carusel" was misspelled (should be "Karusel").

-- =========================================================================
-- A. Manual Eisenhower quadrant (replaces the computed is_urgent/is_important
--    pair entirely — those two booleans never fed anything except this badge
--    once term_type_id/subtasks landed in 0013, so they're now dead weight).
-- =========================================================================

create table task_priority_quadrants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- do_now / schedule / delegate / eliminate
  label_ru text not null,
  label_uz text not null,
  weight int not null,
  sort_order int not null default 0
);

alter table task_priority_quadrants enable row level security;
create policy task_priority_quadrants_select on task_priority_quadrants for select using (auth.uid() is not null);
create policy task_priority_quadrants_write on task_priority_quadrants for all using (is_ceo()) with check (is_ceo());

insert into task_priority_quadrants (slug, label_ru, label_uz, weight, sort_order) values
  ('do_now', 'Срочно и важно', 'Shoshilinch va muhim', 40, 1),
  ('schedule', 'Не срочно, но важно', 'Shoshilinch emas, lekin muhim', 30, 2),
  ('delegate', 'Срочно, но не важно', 'Shoshilinch, lekin muhim emas', 20, 3),
  ('eliminate', 'Не срочно и не важно', 'Shoshilinch va muhim emas', 10, 4);

alter table tasks add column quadrant_id uuid references task_priority_quadrants(id);

-- Backfill from the old computed logic so existing tasks land somewhere
-- sensible instead of all defaulting to one bucket.
update tasks set quadrant_id = (
  select id from task_priority_quadrants where slug = (
    case
      when (deadline is not null and deadline <= now() + interval '3 days') and is_important then 'do_now'
      when not (deadline is not null and deadline <= now() + interval '3 days') and is_important then 'schedule'
      when (deadline is not null and deadline <= now() + interval '3 days') and not is_important then 'delegate'
      else 'eliminate'
    end
  )
);

-- The old view's `t.*` implicitly pulled in is_urgent/is_important as output
-- columns, which makes Postgres register a real dependency on them — so the
-- columns must be dropped BEFORE the view is recreated (with `t.*` again),
-- otherwise the recreated view immediately re-depends on them and the drop
-- below fails with 2BP01.
drop view if exists v_task_queue;
alter table tasks drop column is_urgent;
alter table tasks drop column is_important;

-- sort_score now comes from the manually-picked quadrant weight + deadline
-- proximity. term_type_id remains purely informational (client's own words:
-- "муддат для муддат у нас же календари есть, срочность по эйхензеру").
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
-- B. Task statuses cleanup: rename the confusing "Бэклог", drop "На этой
--    неделе" entirely (reassign any tasks on it to the renamed status first).
-- =========================================================================

update task_statuses set label_ru = 'Новая задача', label_uz = 'Yangi vazifa' where slug = 'backlog';

update tasks set status_id = (select id from task_statuses where slug = 'backlog')
where status_id = (select id from task_statuses where slug = 'this_week');

delete from task_statuses where slug = 'this_week';

-- =========================================================================
-- C. Typo fix: "Carusel" -> "Karusel".
-- =========================================================================

update deliverable_types set label_uz = 'Karusel' where slug = 'carousel';

-- =========================================================================
-- D. New client "sphere" (industry) — client wants free text, not a preset
--    dropdown ("соха должно быть пусто, чел должен сам писать"). Adding a
--    free-text column; the old industry_id FK/lookup stays untouched since
--    nothing else in the app reads it, but nothing forces using it either.
-- =========================================================================

alter table clients add column industry_text text;
