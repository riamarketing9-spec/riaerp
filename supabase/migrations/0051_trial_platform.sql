-- 0051_trial_platform.sql
-- New platform option for content-plan items: Trial.

insert into platforms (slug, label_ru, label_uz) values
  ('trial', 'Trial', 'Trial')
on conflict (slug) do nothing;
