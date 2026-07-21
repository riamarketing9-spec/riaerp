-- 0021_content_plan_rubrics_and_calendar.sql
--
-- Client showed their Notion content-plan setup and asked to match it:
-- 1. "Рубрика" and "Тип" (already "Формат"/content_formats on our side) must
--    be proper lookup dropdowns with a fixed, CEO-extendable set of options
--    — not free text. Round 9 added `rubric` as free text; this replaces it
--    with a real lookup + FK, and expands content_formats with the richer
--    set of "Type" values shown in their Notion (Trial reel, Short Video,
--    Photo, Voice Chat, Live, Webinar, Carousel, Matn, Interview) on top of
--    the existing ones (Reels, Post, Stories, Video, FB реклама).
-- 2. A "URL= refrens" reference-link field.
-- (The calendar view itself is pure frontend — no schema needed for that.)

-- =========================================================================
-- A. content_rubrics lookup (replaces the free-text `rubric` column)
-- =========================================================================
create table content_rubrics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label_ru text not null,
  label_uz text not null,
  sort_order int not null default 0
);

alter table content_rubrics enable row level security;
create policy content_rubrics_select on content_rubrics for select using (auth.uid() is not null);
create policy content_rubrics_write on content_rubrics for all using (is_ceo()) with check (is_ceo());

insert into content_rubrics (slug, label_ru, label_uz, sort_order) values
  ('mijoz_fikri', 'Отзыв клиента', 'Mijoz fikri', 1),
  ('foydali', 'Полезное', 'Foydali', 2),
  ('sotuvchi', 'Продающее', 'Sotuvchi', 3),
  ('informativ', 'Информационное', 'Informativ', 4),
  ('qiziqarli', 'Интересное', 'Qiziqarli', 5)
on conflict (slug) do nothing;

alter table content_plan_items add column if not exists rubric_id uuid references content_rubrics(id);
alter table content_plan_items drop column if exists rubric;

-- =========================================================================
-- B. Reference link field ("URL= refrens" in their Notion).
-- =========================================================================
alter table content_plan_items add column if not exists reference_url text;

-- =========================================================================
-- C. Expand content_formats ("Type") with the richer set of values shown.
-- =========================================================================
insert into content_formats (slug, label_ru, label_uz) values
  ('trial_reel', 'Пробный Reels', 'Trial reel'),
  ('short_video', 'Короткое видео', 'Short Video'),
  ('photo', 'Фото', 'Photo'),
  ('voice_chat', 'Войс-чат', 'Voice Chat'),
  ('live', 'Прямой эфир', 'Live'),
  ('webinar', 'Вебинар', 'Webinar'),
  ('carousel', 'Карусель', 'Carousel'),
  ('matn', 'Текст', 'Matn'),
  ('interview', 'Интервью', 'Interview')
on conflict (slug) do nothing;
