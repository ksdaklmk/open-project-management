-- Whole-workspace deletion cascades after the parent workspace is no longer
-- FK-visible. Do not create task tombstones for a tenant that is itself being
-- deleted; normal task and project deletions still preserve tombstones.

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

  if not exists (select 1 from workspaces where id = old.workspace_id) then
    return old;
  end if;

  insert into activity (
    workspace_id, actor_id, task_id, verb,
    task_ref_snapshot, task_title_snapshot
  ) values (
    old.workspace_id, actor, old.id, 'deleted', old.ref, old.title
  );
  return old;
end;
$$;

revoke execute on function record_task_activity() from public;
