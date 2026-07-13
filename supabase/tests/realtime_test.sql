-- Realtime publication and child delete-payload configuration.
begin;
select plan(14);
set local role postgres;

select ok(exists(select 1 from pg_publication where pubname = 'supabase_realtime'),
  'Supabase Realtime publication exists');

select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime'
  and schemaname = 'public' and tablename = 'tasks'), 'tasks are published');
select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime'
  and schemaname = 'public' and tablename = 'task_tags'), 'task tags are published');
select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime'
  and schemaname = 'public' and tablename = 'subtasks'), 'subtasks are published');
select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime'
  and schemaname = 'public' and tablename = 'comments'), 'comments are published');
select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime'
  and schemaname = 'public' and tablename = 'activity'), 'activity is published');
select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime'
  and schemaname = 'public' and tablename = 'workspace_members'), 'members are published');
select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime'
  and schemaname = 'public' and tablename = 'projects'), 'projects are published');
select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime'
  and schemaname = 'public' and tablename = 'workspace_invitations'), 'invitations are published');
select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime'
  and schemaname = 'public' and tablename = 'notifications'), 'notifications are published');
select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime'
  and schemaname = 'public' and tablename = 'notification_reads'), 'notification reads are published');

select is((select relreplident::text from pg_class where oid = 'task_tags'::regclass),
  'f', 'task tags use full replica identity');
select is((select relreplident::text from pg_class where oid = 'subtasks'::regclass),
  'f', 'subtasks use full replica identity');
select is((select relreplident::text from pg_class where oid = 'comments'::regclass),
  'f', 'comments use full replica identity');

select * from finish(true);
rollback;
