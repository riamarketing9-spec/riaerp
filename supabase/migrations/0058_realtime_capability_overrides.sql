-- Lets the client push capability grants/revokes to an already-open
-- session instantly (Realtime), instead of only picking them up on the
-- next login -- see AuthProvider.tsx's subscription on this table.
alter publication supabase_realtime add table profile_capability_overrides;
