-- Minimal deterministic database-test bootstrap. Product fixtures live inside
-- each transactional test file, so tests never depend on supabase/seed.sql.
create extension if not exists pgtap with schema extensions;
