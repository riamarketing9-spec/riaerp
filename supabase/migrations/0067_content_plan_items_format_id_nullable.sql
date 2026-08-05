-- format_id is now just "first selected work type" for legacy readers,
-- kept in sync from content_plan_formats (the actual multiselect) rather
-- than being the field the user edits directly -- can no longer require
-- NOT NULL since a brand-new item may briefly have zero formats selected.
alter table content_plan_items alter column format_id drop not null;
