-- Production signups create only a profile. Workspace access is granted by
-- verified invitation acceptance or explicit workspace creation, never by a
-- magic demo UUID. The local Northwind fixtures and memberships live only in
-- supabase/seed.sql, which must not be applied to hosted environments.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'user_name', ''),
      ''
    )
  );
  return new;
end;
$$;

revoke execute on function handle_new_user() from public, anon, authenticated;
