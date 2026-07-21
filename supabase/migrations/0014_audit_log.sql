-- 0014_audit_log.sql
-- Client asked for a full "who did what, when" trail across the whole
-- system (not just tasks) — nothing like this existed before; notification_log
-- is Telegram-specific, client_interactions is sales-specific, export_log is
-- backup-export-specific. This is a new, generic table + trigger applied to
-- every content-bearing table so nothing needs bespoke logging code later.

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_profile_id uuid references profiles(id),
  changed_at timestamptz not null default now(),
  diff jsonb
);

create index idx_audit_log_table_name on audit_log (table_name, changed_at desc);
create index idx_audit_log_actor on audit_log (actor_profile_id, changed_at desc);

alter table audit_log enable row level security;
create policy audit_log_select_ceo on audit_log for select using (is_ceo());
-- Writes only ever happen via the trigger (security definer), never directly
-- from the client — no insert/update/delete policy for any role.

create or replace function log_audit_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec_id uuid;
  diff_val jsonb;
begin
  if tg_op = 'DELETE' then
    rec_id := old.id;
    diff_val := jsonb_build_object('old', to_jsonb(old));
  elsif tg_op = 'INSERT' then
    rec_id := new.id;
    diff_val := jsonb_build_object('new', to_jsonb(new));
  else
    rec_id := new.id;
    diff_val := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  end if;

  insert into audit_log (table_name, record_id, action, actor_profile_id, diff)
  values (tg_table_name, rec_id, lower(tg_op), auth_profile_id(), diff_val);

  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'tasks', 'projects', 'content_plan_items', 'clients', 'leads',
    'finance_expenses', 'finance_project_revenue', 'payroll_runs',
    'documents', 'contracts', 'profiles'
  ]
  loop
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on %1$s for each row execute function log_audit_event();',
      t
    );
  end loop;
end $$;
