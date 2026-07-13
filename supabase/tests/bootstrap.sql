-- Minimal deterministic database-test bootstrap. Product fixtures live inside
-- each transactional test file, so tests never depend on supabase/seed.sql.
-- In particular, do not create the local Northwind demo here: production-style
-- signup tests must prove that profiles receive no implicit workspace access.
create extension if not exists pgtap with schema extensions;

-- Older local stacks may already have pgTAP in public. Keep test-only objects
-- out of application-schema drift checks while remaining idempotent on clean
-- CI databases where the extension is created in extensions above.
do $$
begin
  if (
    select n.nspname
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgtap'
  ) <> 'extensions' then
    alter extension pgtap set schema extensions;
  end if;
end;
$$;
