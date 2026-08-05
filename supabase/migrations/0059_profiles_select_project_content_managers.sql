-- Additive SELECT policy (existing policies untouched) -- someone with
-- projects.manage or content_plan.manage needs to see the team roster to
-- assign people to tasks/content-plan items (Syomkachi/Montajchi/SMMchi
-- pickers in ContentItemSheet.tsx), even without cabinets.read_all. Without
-- this, RLS silently limited them to seeing only their own profile row,
-- so every assignee dropdown outside their own specialty rendered empty.
create policy profiles_select_project_content_managers on profiles for select using (
  has_capability('projects.manage') or has_capability('content_plan.manage')
);
