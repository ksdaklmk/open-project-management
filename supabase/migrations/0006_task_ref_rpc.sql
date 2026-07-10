-- 0006_task_ref_rpc.sql
-- docs/AUDIT.md finding 4: client-side ref numbering reads at most 1,000 refs
-- (config.toml max_rows), so past that the client's max-scan misses refs and
-- task creation loops on collisions forever. Ref allocation moves server-side:
-- a per-project counter bumped under the project row lock, so concurrent
-- creates serialise and refs never collide or regress.

alter table projects add column next_task_num int not null default 101;

-- Backfill: continue after the highest existing numeric ref suffix per
-- project (seed convention numbers a project's first task KEY-101).
update projects p set next_task_num = greatest(100, coalesce((
  select max((regexp_match(t.ref, '-(\d+)$'))[1]::int)
  from tasks t where t.project_id = p.id), 100)) + 1;

-- SECURITY DEFINER because the counter column is deliberately not
-- client-writable (0005). RLS is bypassed inside, so membership and
-- authorship are enforced explicitly; search_path is pinned as usual.
create or replace function create_task(p_project_id uuid, p_title text)
returns tasks language plpgsql security definer set search_path = public as $$
declare
  proj projects%rowtype;
  new_task tasks%rowtype;
  num int;
begin
  -- Row lock serialises concurrent allocations for the same project.
  select * into proj from projects where id = p_project_id for update;
  if proj.id is null or not is_member(proj.workspace_id) then
    raise exception 'not a member of this project''s workspace'
      using errcode = '42501';
  end if;
  loop
    update projects set next_task_num = next_task_num + 1
      where id = p_project_id
      returning next_task_num - 1 into num;
    begin
      insert into tasks (project_id, workspace_id, ref, title, created_by)
        values (p_project_id, proj.workspace_id, proj.key || '-' || num,
                p_title, auth.uid())
        returning * into new_task;
      return new_task;
    exception when unique_violation then
      -- Ref taken by an out-of-band insert; bump and retry.
    end;
  end loop;
end; $$;

revoke execute on function create_task(uuid, text) from public;
grant execute on function create_task(uuid, text) to authenticated;

notify pgrst, 'reload schema';
