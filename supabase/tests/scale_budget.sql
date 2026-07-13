-- Requires supabase/fixtures/scale.sql. Hosted p95 evidence remains the gate.
set statement_timeout = '10s';
create temporary table scale_timings (duration_ms double precision);

do $$
declare
  started timestamptz;
  workspace uuid := md5('scale-workspace-1')::uuid;
begin
  for sample in 1..20 loop
    started := clock_timestamp();
    perform count(*) from query_tasks(
      p_workspace_id := workspace,
      p_status := array['todo','in_progress']::task_status[],
      p_search := case when sample % 2 = 0 then 'performance' else null end,
      p_limit := 200
    );
    insert into scale_timings values (
      extract(epoch from (clock_timestamp() - started)) * 1000
    );
  end loop;
end;
$$;

do $$
declare p95 double precision;
begin
  select percentile_cont(0.95) within group (order by duration_ms)
  into p95 from scale_timings;
  raise notice 'Local query p95: % ms / 2000 ms', round(p95::numeric, 2);
  if p95 >= 2000 then
    raise exception 'local query p95 exceeds 2000 ms: %', p95;
  end if;
end;
$$;

do $$
declare returned integer;
begin
  select count(*) into returned from query_tasks(
    p_workspace_id := md5('scale-workspace-1')::uuid,
    p_limit := 200
  );
  if returned > 201 then
    raise exception 'task page returned % rows; expected at most 201', returned;
  end if;
end;
$$;
