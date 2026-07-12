-- 0010_checklist_item_i18n.sql
-- checklist_template_items.label was seeded in Russian only with no Uzbek
-- counterpart, so switching the UI language to UZ left checklist text stuck
-- in Russian while the rest of the chrome translated. Bring it in line with
-- every other lookup table (label_ru + label_uz).

alter table checklist_template_items rename column label to label_ru;
alter table checklist_template_items add column label_uz text;

update checklist_template_items set label_uz = case label_ru
  when 'Проверил(а) свои задачи на сегодня' then 'Bugungi vazifalarimni tekshirdim'
  when 'Отправил(а) отчёт по текущей работе' then 'Joriy ish bo''yicha hisobot yubordim'
  when 'Проверил(а) рекламу/публикации (если применимо)' then 'Reklama/nashrlarni tekshirdim (agar tegishli bo''lsa)'
  when 'Разобрали ошибки и удачи за неделю с командой' then 'Jamoa bilan haftalik xato va yutuqlarni tahlil qildik'
  when 'Проекты закрыты, финальные отчёты клиентам подготовлены' then 'Loyihalar yopilgan, mijozlar uchun yakuniy hisobotlar tayyor'
  else label_ru
end;

alter table checklist_template_items alter column label_uz set not null;
