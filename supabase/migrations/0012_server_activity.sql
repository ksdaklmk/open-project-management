-- Activity is immutable, server-authored, and committed in the same
-- transaction as the underlying task or comment change.

alter table activity
  add column task_ref_snapshot text,
  add column task_title_snapshot text;

update activity event
set task_ref_snapshot = task.ref,
    task_title_snapshot = task.title
from tasks task
where task.id = event.task_id;

alter table activity drop constraint activity_verb_check;
alter table activity add constraint activity_verb_check
  check (verb in ('created','moved','assigned','commented','deleted'));

drop policy activity_insert on activity;
revoke insert, update, delete on activity from authenticated;

create or replace function record_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into activity (
      workspace_id, actor_id, task_id, verb,
      task_ref_snapshot, task_title_snapshot
    ) values (
      new.workspace_id, actor, new.id, 'created', new.ref, new.title
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into activity (
        workspace_id, actor_id, task_id, verb, from_status, to_status,
        task_ref_snapshot, task_title_snapshot
      ) values (
        new.workspace_id, actor, new.id, 'moved', old.status, new.status,
        new.ref, new.title
      );
    end if;
    if new.assignee_id is distinct from old.assignee_id then
      insert into activity (
        workspace_id, actor_id, task_id, verb,
        task_ref_snapshot, task_title_snapshot
      ) values (
        new.workspace_id, actor, new.id, 'assigned', new.ref, new.title
      );
    end if;
    return new;
  end if;

  -- Deletions produce a tombstone event. Snapshot columns retain the task
  -- identity after the task_id foreign key becomes null on delete.
  insert into activity (
    workspace_id, actor_id, task_id, verb,
    task_ref_snapshot, task_title_snapshot
  ) values (
    old.workspace_id, actor, old.id, 'deleted', old.ref, old.title
  );
  return old;
end;
$$;

create or replace function record_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare task_row tasks%rowtype;
begin
  select * into strict task_row from tasks where id = new.task_id;
  insert into activity (
    workspace_id, actor_id, task_id, comment_id, verb,
    task_ref_snapshot, task_title_snapshot
  ) values (
    task_row.workspace_id, auth.uid(), task_row.id, new.id, 'commented',
    task_row.ref, task_row.title
  );
  return new;
end;
$$;

create trigger task_activity_after_insert
after insert on tasks
for each row execute function record_task_activity();

create trigger task_activity_after_update
after update of status, assignee_id on tasks
for each row execute function record_task_activity();

create trigger task_activity_before_delete
before delete on tasks
for each row execute function record_task_activity();

create trigger comment_activity_after_insert
after insert on comments
for each row execute function record_comment_activity();

revoke execute on function record_task_activity() from public;
revoke execute on function record_comment_activity() from public;

notify pgrst, 'reload schema';
