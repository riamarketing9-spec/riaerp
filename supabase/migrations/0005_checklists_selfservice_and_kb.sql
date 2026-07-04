-- 0005_checklists_selfservice_and_kb.sql
-- Two gaps found while closing out the TZ:
-- 1. checklist_instances could only be inserted by CEO (originally assumed a
--    pg_cron job would create them as service role). We're generating them
--    lazily instead (employee's own client creates today's/this week's/this
--    month's instance on first cabinet visit if missing), so a normal user
--    needs to be able to insert their OWN instance + its items.
-- 2. Knowledge base (video lessons / role instructions for onboarding) was
--    planned but never actually created as a table.

create policy checklist_instances_insert_own on checklist_instances for insert with check (
  profile_id = auth_profile_id()
);

create policy checklist_instance_items_insert_own on checklist_instance_items for insert with check (
  exists (
    select 1 from checklist_instances ci where ci.id = checklist_instance_items.instance_id
    and ci.profile_id = auth_profile_id()
  )
);

create table kb_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body_markdown text,
  video_url text,
  role_id uuid references roles(id),
  department_id uuid references departments(id),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_kb_articles_updated_at
  before update on kb_articles
  for each row execute function set_updated_at();

alter table kb_articles enable row level security;

-- Broad-read by design: this module exists so a new hire can self-onboard.
create policy kb_articles_select on kb_articles for select using (auth.uid() is not null);
create policy kb_articles_write on kb_articles for all using (is_ceo()) with check (is_ceo());

-- Seed checklist templates for the three cadences (generic, applies to all roles).
insert into checklist_templates (cadence_id, title, applies_to_all)
select id, 'Ежедневный чек-лист', true from checklist_cadences where slug = 'daily'
on conflict do nothing;

insert into checklist_templates (cadence_id, title, applies_to_all)
select id, 'Еженедельный разбор', true from checklist_cadences where slug = 'weekly'
on conflict do nothing;

insert into checklist_templates (cadence_id, title, applies_to_all)
select id, 'Закрытие месяца', true from checklist_cadences where slug = 'monthly'
on conflict do nothing;

insert into checklist_template_items (template_id, label, sort_order, requires_note)
select t.id, i.label, i.sort_order, i.requires_note
from checklist_templates t
join checklist_cadences c on c.id = t.cadence_id
join (values
  ('daily', 'Проверил(а) свои задачи на сегодня', 1, false),
  ('daily', 'Отправил(а) отчёт по текущей работе', 2, false),
  ('daily', 'Проверил(а) рекламу/публикации (если применимо)', 3, false),
  ('weekly', 'Разобрали ошибки и удачи за неделю с командой', 1, true),
  ('monthly', 'Проекты закрыты, финальные отчёты клиентам подготовлены', 1, true)
) as i(cadence_slug, label, sort_order, requires_note) on i.cadence_slug = c.slug
where t.applies_to_all = true
on conflict do nothing;
