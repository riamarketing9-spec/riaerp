-- Per the CEO: recurring ("chek-list") tasks used to spawn their next
-- instance the moment they were marked done (old row kept for history).
-- That's replaced entirely by exact-interval, schedule-driven regeneration
-- (see the checklist-regenerate edge function + pg_cron job in the next
-- migration) -- delete-old/create-new happens only at 7:00 Tashkent, on
-- the exact interval boundary, regardless of when/whether the task was
-- checked off early. Keeps part A (checklist<->status sync) unchanged.
create or replace function sync_task_done_checklist_and_recurrence() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  done_status_id uuid;
  has_items boolean;
begin
  select id into done_status_id from task_statuses where slug = 'done';
  if new.status_id is distinct from done_status_id or old.status_id = done_status_id then
    return new;
  end if;

  -- Task just moved INTO done.
  select exists(select 1 from task_items where task_id = new.id) into has_items;
  if has_items then
    update task_items set is_done = true where task_id = new.id and is_done = false;
  else
    update tasks set percent_complete = 100 where id = new.id;
  end if;

  return new;
end;
$$;
