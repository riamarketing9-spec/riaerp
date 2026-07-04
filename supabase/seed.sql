-- seed.sql
-- Base roles, capabilities, and lookup values. Safe to re-run (idempotent upserts).

-- Roles
insert into roles (slug, label_ru, label_uz, is_management, max_open_tasks) values
  ('ceo', 'Руководитель (CEO)', 'Rahbar (CEO)', true, 999),
  ('pm', 'Проект-менеджер', 'Loyiha menejeri (PM)', true, 5),
  ('financier', 'Финансист', 'Moliyachi', true, 5),
  ('smm_manager', 'SMM менеджер', 'SMM menejer', false, 3),
  ('targetolog', 'Таргетолог', 'Targetolog', false, 3),
  ('montajchi', 'Монтажер', 'Montajchi', false, 3),
  ('designer', 'Дизайнер', 'Dizayner', false, 3),
  ('syomkachi', 'Съемщик', 'Syomkachi', false, 3),
  ('shogird', 'Стажер', 'Shogird', false, 2)
on conflict (slug) do nothing;

-- Capabilities per role
insert into role_capabilities (role_id, capability)
select r.id, c.capability
from roles r
cross join (values
  ('ceo', 'org.full_access'),
  ('ceo', 'finance.read'),
  ('ceo', 'finance.write'),
  ('ceo', 'cabinets.read_all'),
  ('ceo', 'projects.manage'),
  ('ceo', 'projects.read_scoped'),
  ('ceo', 'sales.read'),
  ('ceo', 'sales.manage'),
  ('ceo', 'docs.admin'),

  ('pm', 'projects.manage'),
  ('pm', 'projects.read_scoped'),
  ('pm', 'cabinets.read_all'),
  ('pm', 'sales.read'),

  ('financier', 'finance.read'),
  ('financier', 'finance.write'),

  ('smm_manager', 'projects.read_scoped'),

  ('targetolog', 'projects.read_scoped')
) as c(role_slug, capability)
where r.slug = c.role_slug
on conflict do nothing;

-- Departments
insert into departments (slug, label_ru, label_uz) values
  ('smm', 'SMM отдел', 'SMM bo''limi'),
  ('target', 'Таргет отдел', 'Target bo''limi'),
  ('management', 'Управление', 'Boshqaruv')
on conflict (slug) do nothing;

-- Staff statuses
insert into staff_statuses (slug, label_ru, label_uz) values
  ('active', 'Активен', 'Faol'),
  ('trainee', 'Стажер', 'Shogird'),
  ('inactive', 'Неактивен', 'Faol emas')
on conflict (slug) do nothing;

-- Workload levels
insert into workload_levels (slug, label_ru, label_uz, color, sort_order) values
  ('light', 'Свободен', 'Yengil', 'green', 1),
  ('normal', 'Норма', 'Normal', 'yellow', 2),
  ('busy', 'Перегружен', 'Band', 'red', 3)
on conflict (slug) do nothing;

-- Project types / statuses
insert into project_types (slug, label_ru, label_uz) values
  ('smm', 'SMM', 'SMM'),
  ('target', 'Таргет', 'Target')
on conflict (slug) do nothing;

insert into project_statuses (slug, label_ru, label_uz, sort_order) values
  ('new', 'Новый', 'Yangi', 1),
  ('active', 'Активен', 'Faol', 2),
  ('paused', 'Пауза', 'Pauza', 3),
  ('done', 'Завершен', 'Yakunlangan', 4)
on conflict (slug) do nothing;

-- Task statuses / priorities / recurrence
insert into task_statuses (slug, label_ru, label_uz, sort_order) values
  ('backlog', 'Бэклог', 'Backlog', 1),
  ('this_week', 'На этой неделе', 'Bu hafta', 2),
  ('in_progress', 'В процессе', 'Jarayonda', 3),
  ('review', 'На проверке', 'Tekshiruv', 4),
  ('done', 'Готово', 'Tayyor', 5)
on conflict (slug) do nothing;

insert into priorities (slug, label_ru, label_uz, weight) values
  ('high', 'Высокий', 'Yuqori', 30),
  ('medium', 'Средний', 'O''rta', 20),
  ('low', 'Низкий', 'Past', 10)
on conflict (slug) do nothing;

insert into recurrence_types (slug, label_ru, label_uz) values
  ('daily', 'Ежедневно', 'Kunlik'),
  ('weekly', 'Еженедельно', 'Haftalik'),
  ('monthly', 'Ежемесячно', 'Oylik'),
  ('one_time', 'Разово', 'Bir martalik')
on conflict (slug) do nothing;

-- Content formats / platforms / statuses
insert into content_formats (slug, label_ru, label_uz) values
  ('reels', 'Reels', 'Reels'),
  ('post', 'Пост', 'Post'),
  ('stories', 'Сторис', 'Stories'),
  ('video', 'Видео', 'Video'),
  ('fb_ads', 'FB реклама', 'FB reklama')
on conflict (slug) do nothing;

insert into platforms (slug, label_ru, label_uz) values
  ('ig', 'Instagram', 'Instagram'),
  ('tg', 'Telegram', 'Telegram'),
  ('yt', 'YouTube', 'YouTube'),
  ('fb', 'Facebook', 'Facebook')
on conflict (slug) do nothing;

insert into content_statuses (slug, label_ru, label_uz, sort_order) values
  ('plan', 'План', 'Reja', 1),
  ('script', 'Сценарий', 'Ssenariy', 2),
  ('shoot', 'Съемка', 'Syomka', 3),
  ('edit', 'Монтаж', 'Montaj', 4),
  ('ready', 'Готово', 'Tayyor', 5),
  ('published', 'Опубликовано', 'Joylandi', 6)
on conflict (slug) do nothing;

insert into deliverable_types (slug, label_ru, label_uz) values
  ('reels_edit', 'Монтаж Reels', 'Reels montaji'),
  ('post_design', 'Дизайн поста', 'Post dizayni'),
  ('shoot_session', 'Съемка', 'Syomka'),
  ('video_edit', 'Монтаж видео', 'Video montaji'),
  ('target_setup', 'Настройка таргета', 'Target sozlash')
on conflict (slug) do nothing;

insert into checklist_cadences (slug) values
  ('daily'), ('weekly'), ('monthly')
on conflict (slug) do nothing;

-- Sales / HR / finance lookups
insert into client_statuses (slug, label_ru, label_uz) values
  ('potential', 'Потенциальный', 'Potensial'),
  ('active', 'Активный', 'Faol'),
  ('lost', 'Потерян', 'Yo''qotilgan')
on conflict (slug) do nothing;

insert into lead_stages (slug, label_ru, label_uz, sort_order) values
  ('contact', 'Контакт', 'Aloqa', 1),
  ('meeting', 'Встреча', 'Uchrashuv', 2),
  ('proposal', 'Предложение', 'Taklif', 3),
  ('contract', 'Договор', 'Shartnoma', 4)
on conflict (slug) do nothing;

insert into document_categories (slug, label_ru, label_uz) values
  ('hr', 'HR документы', 'HR hujjatlari'),
  ('instruction', 'Инструкция', 'Yo''riqnoma'),
  ('policy', 'Внутренние правила', 'Ichki qoidalar')
on conflict (slug) do nothing;

insert into contract_types (slug) values
  ('client'), ('employee')
on conflict (slug) do nothing;

insert into expense_categories (slug, label_ru, label_uz) values
  ('salary', 'Зарплата', 'Oylik'),
  ('ads_budget', 'Рекламный бюджет', 'Reklama byudjeti'),
  ('software', 'Софт/подписки', 'Dasturiy ta''minot'),
  ('office', 'Офис', 'Ofis'),
  ('other', 'Прочее', 'Boshqa')
on conflict (slug) do nothing;

insert into expense_scopes (slug) values
  ('business'), ('personal')
on conflict (slug) do nothing;

insert into industries (slug, label_ru, label_uz) values
  ('real_estate', 'Недвижимость', 'Ko''chmas mulk'),
  ('retail', 'Розница', 'Chakana savdo'),
  ('food', 'Общепит', 'Ovqatlanish'),
  ('beauty', 'Красота', 'Go''zallik'),
  ('other', 'Другое', 'Boshqa')
on conflict (slug) do nothing;
