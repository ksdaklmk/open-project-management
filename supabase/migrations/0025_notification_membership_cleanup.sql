-- A removed workspace member must stop watching its tasks immediately. Keep
-- immutable in-app history (hidden by tenant-scoped RLS), but retire queued
-- task email so it cannot deliver after access is revoked.

create or replace function cleanup_removed_member_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from task_watchers watcher
  using tasks task
  where watcher.task_id = task.id
    and task.workspace_id = old.workspace_id
    and watcher.user_id = old.user_id;

  update notification_outbox delivery
  set status = 'dead',
      claimed_at = null,
      last_error_code = 'membership_removed'
  from notifications notification
  where delivery.notification_id = notification.id
    and notification.workspace_id = old.workspace_id
    and notification.user_id = old.user_id
    and notification.kind <> 'invitation'
    and delivery.status in ('pending', 'processing');
  return old;
end;
$$;

create trigger notification_membership_cleanup
after delete on workspace_members
for each row execute function cleanup_removed_member_notifications();

revoke execute on function cleanup_removed_member_notifications() from public;

notify pgrst, 'reload schema';
