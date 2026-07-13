-- Validated saved-view configuration, visibility, ownership, defaults, and isolation.
begin;
select plan(37);
set local role postgres;

insert into auth.users (id, email, email_confirmed_at) values
  ('24000000-0000-4000-8000-000000000001', 'saved-owner@test.dev', now()),
  ('24000000-0000-4000-8000-000000000002', 'saved-member@test.dev', now()),
  ('24000000-0000-4000-8000-000000000003', 'saved-foreign@test.dev', now());

update profiles set name = case id
  when '24000000-0000-4000-8000-000000000001' then 'Saved Owner'
  when '24000000-0000-4000-8000-000000000002' then 'Saved Member'
  else 'Saved Foreign' end
where id::text like '24000000-%';

insert into workspaces (id, name, created_by) values
  ('24000000-0000-4000-8000-000000000011', 'Saved workspace',
   '24000000-0000-4000-8000-000000000001'),
  ('24000000-0000-4000-8000-000000000012', 'Foreign workspace',
   '24000000-0000-4000-8000-000000000003');
insert into workspace_members (workspace_id, user_id, role) values
  ('24000000-0000-4000-8000-000000000011',
   '24000000-0000-4000-8000-000000000001', 'owner'),
  ('24000000-0000-4000-8000-000000000011',
   '24000000-0000-4000-8000-000000000002', 'member'),
  ('24000000-0000-4000-8000-000000000012',
   '24000000-0000-4000-8000-000000000003', 'owner');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','24000000-0000-4000-8000-000000000001','role','authenticated')::text,
  true);

select lives_ok(
  $$ select create_saved_view(
       '24000000-0000-4000-8000-000000000011', 'My focused list', 'list',
       '{"filters":{"status":["todo"],"q":"launch"},"sort":"due"}'::jsonb,
       'private'
     ) $$,
  'a member can create a private saved view'
);
select is((select count(*)::int from saved_views where name = 'My focused list'), 1,
  'the owner can read their private saved view');
select is(
  (select configuration from saved_views where name = 'My focused list'),
  '{"filters":{"status":["todo"],"priority":[],"assignee":[],"type":[],"tag":[],"q":"launch"},"sort":"due","group":"status"}'::jsonb,
  'configuration is normalized to the allowlisted contract'
);
select throws_ok(
  $$ insert into saved_views (
       workspace_id, owner_id, name, view_type, configuration
     ) values (
       '24000000-0000-4000-8000-000000000011',
       '24000000-0000-4000-8000-000000000001', 'Forged', 'list', '{}'::jsonb
     ) $$,
  '42501', null, 'authenticated users cannot insert saved views directly'
);

select set_config('request.jwt.claims',
  json_build_object('sub','24000000-0000-4000-8000-000000000002','role','authenticated')::text,
  true);
select is((select count(*)::int from saved_views where name = 'My focused list'), 0,
  'private saved views are owner-only');

select set_config('request.jwt.claims',
  json_build_object('sub','24000000-0000-4000-8000-000000000001','role','authenticated')::text,
  true);
select lives_ok(
  $$ select create_saved_view(
       '24000000-0000-4000-8000-000000000011', 'Team board', 'board',
       '{"filters":{"priority":["urgent"],"assignee":["24000000-0000-4000-8000-000000000002"]},"sort":"priority","group":"status"}'::jsonb,
       'workspace'
     ) $$,
  'a member can create a workspace-visible view'
);

select set_config('request.jwt.claims',
  json_build_object('sub','24000000-0000-4000-8000-000000000002','role','authenticated')::text,
  true);
select is((select count(*)::int from saved_views where name = 'Team board'), 1,
  'workspace-visible views can be resolved by another member');
select throws_ok(
  $$ select update_saved_view(
       (select id from saved_views where name = 'Team board'), 'Hijacked',
       '{"filters":{},"sort":"priority","group":"status"}'::jsonb, 'workspace'
     ) $$,
  '42501', null, 'non-owners cannot update workspace-visible views'
);
select lives_ok(
  $$ select duplicate_saved_view(
       (select id from saved_views where name = 'Team board'), 'My team board copy'
     ) $$,
  'a member can duplicate a visible workspace view'
);
select ok(
  (select owner_id = '24000000-0000-4000-8000-000000000002'
          and visibility = 'private'
   from saved_views where name = 'My team board copy'),
  'duplicates are private and owned by the caller'
);
select is(
  set_default_saved_view(
    '24000000-0000-4000-8000-000000000011', 'board',
    (select id from saved_views where name = 'Team board')
  ), true,
  'a member can make a visible saved view their default'
);
select is(
  (select name from get_default_saved_view(
    '24000000-0000-4000-8000-000000000011', 'board')),
  'Team board', 'the default saved view resolves through the guarded RPC'
);
select throws_ok(
  $$ insert into saved_view_defaults (workspace_id, user_id, view_type, saved_view_id)
     values (
       '24000000-0000-4000-8000-000000000011',
       '24000000-0000-4000-8000-000000000002', 'list',
       (select id from saved_views where name = 'My team board copy')
     ) $$,
  '42501', null, 'authenticated users cannot write defaults directly'
);

select set_config('request.jwt.claims',
  json_build_object('sub','24000000-0000-4000-8000-000000000001','role','authenticated')::text,
  true);
select throws_ok(
  $$ select create_saved_view(
       '24000000-0000-4000-8000-000000000011', 'Unknown key', 'list',
       '{"filters":{},"expression":"drop table tasks"}'::jsonb
     ) $$,
  '22023', null, 'unknown configuration keys are rejected'
);
select throws_ok(
  $$ select create_saved_view(
       '24000000-0000-4000-8000-000000000011', 'Unknown filter', 'list',
       '{"filters":{"sql":"select * from tasks"}}'::jsonb
     ) $$,
  '22023', null, 'unknown filter keys are rejected'
);
select throws_ok(
  $$ select create_saved_view(
       '24000000-0000-4000-8000-000000000011', 'Bad status', 'list',
       '{"filters":{"status":["deleted"]}}'::jsonb
     ) $$,
  '22023', null, 'unsupported taxonomy values are rejected'
);
select throws_ok(
  $$ select create_saved_view(
       '24000000-0000-4000-8000-000000000011', 'Bad array', 'list',
       '{"filters":{"status":[1]}}'::jsonb
     ) $$,
  '22023', null, 'non-string filter values are rejected'
);
select throws_ok(
  $$ select create_saved_view(
       '24000000-0000-4000-8000-000000000011', 'Duplicate status', 'list',
       '{"filters":{"status":["todo","todo"]}}'::jsonb
     ) $$,
  '22023', null, 'duplicate filter values are rejected'
);
select throws_ok(
  $$ select create_saved_view(
       '24000000-0000-4000-8000-000000000011', 'Executable query', 'list',
       '{"filters":{"q":{"$sql":"select current_user"}}}'::jsonb
     ) $$,
  '22023', null, 'objects cannot be smuggled into query text'
);
select throws_ok(
  $$ select create_saved_view(
       '24000000-0000-4000-8000-000000000011', 'Bad group', 'gantt',
       '{"filters":{},"group":"status"}'::jsonb
     ) $$,
  '22023', null, 'grouping is allowlisted per view type'
);
select throws_ok(
  $$ select create_saved_view(
       '24000000-0000-4000-8000-000000000011', 'Foreign assignee', 'list',
       '{"filters":{"assignee":["24000000-0000-4000-8000-000000000003"]}}'::jsonb
     ) $$,
  '22023', null, 'saved assignees must belong to the saved view workspace'
);

select set_config('request.jwt.claims',
  json_build_object('sub','24000000-0000-4000-8000-000000000003','role','authenticated')::text,
  true);
select is_empty(
  $$ select 1 from saved_views
     where workspace_id = '24000000-0000-4000-8000-000000000011' $$,
  'foreign tenants cannot list saved views'
);
select throws_ok(
  $$ select create_saved_view(
       '24000000-0000-4000-8000-000000000011', 'Foreign write', 'list',
       '{"filters":{}}'::jsonb
     ) $$,
  '42501', null, 'foreign tenants cannot create saved views'
);

select set_config('request.jwt.claims',
  json_build_object('sub','24000000-0000-4000-8000-000000000001','role','authenticated')::text,
  true);
select lives_ok(
  $$ select update_saved_view(
       (select id from saved_views where name = 'Team board'), 'Team board revised',
       '{"filters":{"priority":["high"]},"sort":"status","group":"status"}'::jsonb,
       'private'
     ) $$,
  'the owner can update configuration and visibility'
);

select set_config('request.jwt.claims',
  json_build_object('sub','24000000-0000-4000-8000-000000000002','role','authenticated')::text,
  true);
select is_empty(
  $$ select 1 from get_default_saved_view(
       '24000000-0000-4000-8000-000000000011', 'board') $$,
  'making a shared view private removes other users defaults'
);

select set_config('request.jwt.claims',
  json_build_object('sub','24000000-0000-4000-8000-000000000001','role','authenticated')::text,
  true);
select is(
  set_default_saved_view(
    '24000000-0000-4000-8000-000000000011', 'board',
    (select id from saved_views where name = 'Team board revised')
  ), true,
  'an owner can default to a private saved view'
);
select is(
  (select name from get_default_saved_view(
    '24000000-0000-4000-8000-000000000011', 'board')),
  'Team board revised', 'the owner can resolve a private default'
);
select is(
  delete_saved_view((select id from saved_views where name = 'Team board revised')),
  true, 'an owner can delete their saved view'
);
select is_empty(
  $$ select 1 from get_default_saved_view(
       '24000000-0000-4000-8000-000000000011', 'board') $$,
  'deleting a saved view cascades its default'
);
select throws_ok(
  $$ select delete_saved_view(
       (select id from saved_views where name = 'My team board copy')
     ) $$,
  '42501', null, 'one user cannot delete another owners duplicate'
);

set local role postgres;
select ok(has_table_privilege('authenticated', 'saved_views', 'select'),
  'authenticated has the explicit saved-view select grant');
select ok(has_table_privilege('authenticated', 'saved_view_defaults', 'select'),
  'authenticated has the explicit default select grant');
select ok(not has_table_privilege('authenticated', 'saved_views', 'insert'),
  'authenticated has no direct saved-view insert grant');
select ok(not has_table_privilege('authenticated', 'saved_views', 'update'),
  'authenticated has no direct saved-view update grant');
select ok(not has_table_privilege('authenticated', 'saved_views', 'delete'),
  'authenticated has no direct saved-view delete grant');
select ok((select relrowsecurity from pg_class where oid = 'saved_views'::regclass),
  'saved views have RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'saved_view_defaults'::regclass),
  'saved-view defaults have RLS enabled');

select * from finish(true);
rollback;
