-- 0016_project_fields_and_storage.sql
-- New project dialog fields the client asked for, mostly wiring existing
-- schema (client_id, deliverables_text, brief_detail_text, project_members,
-- contracts already exist with no UI) plus a couple of genuinely new columns
-- and the first real Supabase Storage bucket in the project.

-- Target-audience description in 3 optional formats (voice/pdf/text) — the
-- existing `target_audience` text column is the "text" format; these two are new.
alter table projects add column target_audience_voice_url text;
alter table projects add column target_audience_file_url text;

-- Link/file attachments on content plan items (client asked for this on the
-- PM dashboard's content plan view).
alter table content_plan_items add column attachment_url text;

-- Storage bucket for documents/contracts/task attachments/voice notes.
-- Not public — access is gated by the app checking RLS-backed table rows
-- (documents/contracts/etc.) before generating a signed URL; the bucket
-- itself stores opaque files.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy attachments_upload on storage.objects for insert
  with check (bucket_id = 'attachments' and auth.uid() is not null);
create policy attachments_read on storage.objects for select
  using (bucket_id = 'attachments' and auth.uid() is not null);
create policy attachments_delete on storage.objects for delete
  using (bucket_id = 'attachments' and auth.uid() is not null);
