-- 0023_notification_log_content_plan.sql
--
-- deadline-check is being extended to also remind shooters/editors/
-- responsible people about content-plan publish dates (client: "за всё где
-- он отмечен" — for everything they're tagged on, not just tasks). The log
-- needs a second nullable FK so we can dedupe content-plan reminders the
-- same way task reminders are already deduped.

alter table notification_log add column if not exists related_content_plan_item_id uuid references content_plan_items(id);
