-- 0043_employee_soft_delete.sql
-- Removing an employee used to hard-delete the auth user, which cascaded
-- the profiles row away entirely -- no trace of who was removed, when, or
-- by whom. Switch to a soft delete: keep the profile row (so historical
-- tasks/content-plan items still resolve a name) but stamp it as removed,
-- and let admin-delete-user (service role) ban the auth account instead of
-- deleting it, so access is revoked immediately without losing the record.

alter table profiles add column deleted_at timestamptz;
alter table profiles add column deleted_by uuid references profiles(id);

-- Active-roster queries (Team page, assignee pickers, workload view) should
-- exclude removed employees by default; only CEO/team.manage need to see
-- the removed history, via a dedicated query with is_ceo()/has_capability.
create index idx_profiles_deleted_at on profiles (deleted_at);
