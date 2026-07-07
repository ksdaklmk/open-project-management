-- Adoption hardening (spec: docs/superpowers/specs/2026-07-07-make-it-adoptable-design.md)
--   1. Name: coalesce across OAuth metadata variants (Google sets `name`;
--      GitHub sets `full_name`/`user_name`; email+password signups pass
--      options.data.name or nothing). nullif() so an empty '' from one
--      provider key does not shadow a real value in the next.
--   2. Demo auto-join: pinned to the seeded demo workspace's fixed UUID
--      instead of name = 'Northwind'. Local dev (seeded) keeps the
--      convenience; production is never demo-seeded so this silently
--      no-ops; a real workspace named "Northwind" attracts nothing.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare demo uuid;
begin
  insert into public.profiles (id, name)
    values (new.id, coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'user_name', ''),
      ''));
  select id into demo from public.workspaces
    where id = '20000000-0000-0000-0000-000000000001';
  if demo is not null then
    insert into public.workspace_members (workspace_id, user_id) values (demo, new.id);
  end if;
  return new;
end; $$;
