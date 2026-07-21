-- 0015_deliverable_types_and_kb_reads.sql

-- New deliverable/work types the client uses that weren't in the original seed.
insert into deliverable_types (slug, label_ru, label_uz) values
  ('design_post', 'Дизайн поста', 'Design post'),
  ('design_cover', 'Дизайн обложки', 'Design cover'),
  ('carousel', 'Карусель', 'Carusel'),
  ('trial_montaj', 'Пробный монтаж', 'Trial montaj'),
  ('content_plan_weekly', 'Контент-план (неделя)', 'Content plan haftalik'),
  ('content_plan_monthly', 'Контент-план (месяц)', 'Content plan 1 oylik'),
  ('funnel_work', 'Работа по воронке', 'Voronka bo''yicha ishlash')
on conflict (slug) do nothing;

-- Read-receipt tracking for Knowledge Base articles (job descriptions etc.) —
-- kb_articles already supports role/department targeting but had no way to
-- confirm someone actually read it.
create table kb_reads (
  profile_id uuid not null references profiles(id) on delete cascade,
  article_id uuid not null references kb_articles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (profile_id, article_id)
);

alter table kb_reads enable row level security;
create policy kb_reads_select on kb_reads for select using (
  profile_id = auth_profile_id() or is_ceo()
);
create policy kb_reads_insert_own on kb_reads for insert with check (
  profile_id = auth_profile_id()
);
