-- 0054_personal_documents.sql
-- Documents page redesign: every entry is now someone's personal file (a
-- document or an employment-side contract attached to one employee), split
-- into two tabs in the UI. Distinct from the `contracts` table (0003),
-- which is client contracts tied to a project -- unrelated concept, same
-- English word.
--
-- Employees should only see their own entries; PM/CEO (already docs.admin
-- via role_capabilities) see everyone's with an employee filter. The old
-- is_org_wide / document_visibility grant model is left in place in the DB
-- (still OR'd into the select policy below) but the new UI doesn't write to
-- it anymore -- nothing to migrate, no rows depended on it being removed.

alter table documents add column profile_id uuid references profiles(id);
alter table documents add column note text;
alter table documents add column kind text not null default 'document' check (kind in ('document', 'contract'));

drop policy if exists documents_select on documents;
create policy documents_select on documents for select using (
  is_ceo()
  or has_capability('docs.admin')
  or profile_id = auth_profile_id()
  or is_org_wide
  or exists (select 1 from document_visibility dv where dv.document_id = documents.id and dv.profile_id = auth_profile_id())
);
