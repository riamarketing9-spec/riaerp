-- 0028_telegram_multi_link.sql
-- profiles.telegram_chat_id could only ever hold one chat, so linking a new
-- phone/Telegram account silently kicked the old one off with no way back.
-- Replaces it with a proper one-profile-to-many-chats table: every place
-- that used to read profiles.telegram_chat_id now sends to every linked
-- chat for that profile instead of a single one.

create table profile_telegram_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  chat_id text not null unique,
  telegram_label text,
  linked_at timestamptz not null default now()
);

alter table profile_telegram_links enable row level security;

create policy profile_telegram_links_select_own on profile_telegram_links
  for select using (profile_id = auth_profile_id());

create policy profile_telegram_links_select_ceo on profile_telegram_links
  for select using (is_ceo());

create policy profile_telegram_links_delete_own on profile_telegram_links
  for delete using (profile_id = auth_profile_id());

create policy profile_telegram_links_delete_ceo on profile_telegram_links
  for delete using (is_ceo());

-- Carry over whatever's already linked before the old column goes away.
insert into profile_telegram_links (profile_id, chat_id)
select id, telegram_chat_id from profiles where telegram_chat_id is not null
on conflict (chat_id) do nothing;

alter table profiles drop column telegram_chat_id;
