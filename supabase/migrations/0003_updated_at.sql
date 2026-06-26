create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;
create trigger trg_tasks_updated_at before update on tasks
  for each row execute function set_updated_at();
