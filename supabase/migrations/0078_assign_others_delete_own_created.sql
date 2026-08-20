-- tasks_delete only lets a creator delete a task they made when it's ALSO
-- still self-assigned (created_by = assignee = self). A tasks.assign_others
-- holder (smm_manager/smm_assistant/shogird) who assigns a task to someone
-- else has no way to undo a mistake -- reported live: "почему их нельзя
-- удалить, вдруг он по ошибке напишет и захочет удалить". Additive: lets
-- them delete only what THEY created, regardless of who it's assigned to
-- (still can't touch a task someone else created, even for the same
-- assignee). Existing tasks_delete stays untouched, OR-combined.
create policy tasks_delete_scoped_assign on tasks for delete using (
  has_capability('tasks.assign_others')
  and created_by = auth_profile_id()
);
