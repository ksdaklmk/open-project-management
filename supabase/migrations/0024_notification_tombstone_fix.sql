-- Notifications retain a ref snapshot after a task is deleted. The nullable
-- task/invitation foreign keys must therefore be allowed to tombstone without
-- invalidating immutable notification history.

alter table notifications drop constraint notifications_subject_valid;
alter table notifications add constraint notifications_subject_valid check (
  kind = 'invitation' or task_ref_snapshot is not null
);

notify pgrst, 'reload schema';
