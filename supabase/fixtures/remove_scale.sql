-- Removes only identities created by scale.sql.
delete from workspaces
where id in (
  select md5('scale-workspace-' || n)::uuid from generate_series(1, 10) n
);

delete from auth.users
where id in (
  select md5('scale-user-' || n)::uuid from generate_series(1, 100) n
);
