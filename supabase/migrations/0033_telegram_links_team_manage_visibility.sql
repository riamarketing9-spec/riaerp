-- 0033_telegram_links_team_manage_visibility.sql
-- profile_telegram_links was only visible to (a) the linked profile itself
-- or (b) a true CEO (is_ceo()). The Team page is also open to anyone with
-- team.manage (PMs), but they only ever saw their OWN link there -- everyone
-- else showed "not connected" regardless of reality, since RLS silently
-- hid every other row from them.

create policy profile_telegram_links_select_team_manage on profile_telegram_links
  for select using (has_capability('team.manage'));
