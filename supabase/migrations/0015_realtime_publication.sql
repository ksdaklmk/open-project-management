-- Publish workspace collaboration tables for Supabase Realtime. Child tables
-- retain full old rows so delete/update events can be reconciled to the
-- narrow parent query when the payload is available.

alter table task_tags replica identity full;
alter table subtasks replica identity full;
alter table comments replica identity full;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'tasks',
    'task_tags',
    'subtasks',
    'comments',
    'activity',
    'workspace_members',
    'projects',
    'workspace_invitations'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
