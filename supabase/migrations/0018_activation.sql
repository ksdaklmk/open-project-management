-- Phase 2 activation funnel. Events contain identifiers and timestamps only:
-- no workspace/project/task names, invitation addresses, or free-form payloads.

create table activation_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  event_name text not null check (event_name in (
    'workspace_created',
    'project_created',
    'task_created',
    'invitation_sent',
    'invitation_accepted',
    'member_active',
    'workload_viewed',
    'gantt_viewed'
  )),
  subject_id uuid,
  occurred_at timestamptz not null default now()
);

create unique index activation_events_deduplicate_idx
  on activation_events (
    workspace_id,
    event_name,
    coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index activation_events_workspace_time_idx
  on activation_events (workspace_id, occurred_at, event_name);

create table onboarding_dismissals (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table activation_events enable row level security;
alter table onboarding_dismissals enable row level security;

create policy activation_event_read on activation_events for select
  using (is_member(workspace_id));

create policy onboarding_dismissal_read on onboarding_dismissals for select
  using (user_id = auth.uid() and is_member(workspace_id));
create policy onboarding_dismissal_insert on onboarding_dismissals for insert
  with check (user_id = auth.uid() and is_member(workspace_id));
create policy onboarding_dismissal_update on onboarding_dismissals for update
  using (user_id = auth.uid() and is_member(workspace_id))
  with check (user_id = auth.uid() and is_member(workspace_id));

grant select on activation_events to authenticated;
grant select, insert, update on onboarding_dismissals to authenticated;

-- Trigger-only helper. The unique expression index makes every signal
-- idempotent for a given actor/subject while retaining the first timestamp.
create or replace function capture_activation_event(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_event_name text,
  p_subject_id uuid,
  p_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_name not in (
    'workspace_created', 'project_created', 'task_created',
    'invitation_sent', 'invitation_accepted', 'member_active',
    'workload_viewed', 'gantt_viewed'
  ) then
    raise exception 'unsupported activation event' using errcode = '22023';
  end if;

  insert into activation_events (
    workspace_id, actor_id, event_name, subject_id, occurred_at
  ) values (
    p_workspace_id, p_actor_id, p_event_name, p_subject_id,
    coalesce(p_occurred_at, now())
  ) on conflict do nothing;
end;
$$;

create or replace function track_workspace_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform capture_activation_event(
    new.id, new.created_by, 'workspace_created', new.id, new.created_at
  );
  return new;
end;
$$;

create or replace function track_project_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform capture_activation_event(
    new.workspace_id, auth.uid(), 'project_created', new.id, new.created_at
  );
  return new;
end;
$$;

create or replace function track_task_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform capture_activation_event(
    new.workspace_id, new.created_by, 'task_created', new.id, new.created_at
  );
  return new;
end;
$$;

create or replace function track_invitation_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.last_sent_at is distinct from old.last_sent_at then
    perform capture_activation_event(
      new.workspace_id, new.invited_by, 'invitation_sent', new.id, new.last_sent_at
    );
  end if;
  if new.accepted_at is not null
     and (tg_op = 'INSERT' or new.accepted_at is distinct from old.accepted_at) then
    perform capture_activation_event(
      new.workspace_id, null, 'invitation_accepted', new.id, new.accepted_at
    );
  end if;
  return new;
end;
$$;

create trigger activation_workspace_insert
after insert on workspaces
for each row execute function track_workspace_activation();
create trigger activation_project_insert
after insert on projects
for each row execute function track_project_activation();
create trigger activation_task_insert
after insert on tasks
for each row execute function track_task_activation();
create trigger activation_invitation_change
after insert or update of last_sent_at, accepted_at on workspace_invitations
for each row execute function track_invitation_activation();

-- Client-callable signals are a fixed enum-like set. Actor identity always
-- comes from the JWT and membership is checked beneath the UI.
create or replace function record_activation_signal(
  p_workspace_id uuid,
  p_event_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare caller uuid := auth.uid();
begin
  if caller is null or not is_member(p_workspace_id) then
    raise exception 'not a workspace member' using errcode = '42501';
  end if;
  if p_event_name not in ('member_active', 'workload_viewed', 'gantt_viewed') then
    raise exception 'unsupported client activation signal' using errcode = '22023';
  end if;
  perform capture_activation_event(
    p_workspace_id, caller, p_event_name, caller, now()
  );
end;
$$;

create or replace function get_activation_status(p_workspace_id uuid)
returns table (
  workspace_created boolean,
  project_created boolean,
  task_count integer,
  invitation_sent boolean,
  second_member_active boolean,
  core_view_opened boolean,
  checklist_complete boolean,
  activated_within_7_days boolean,
  dismissed boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  workspace_started timestamptz;
begin
  if caller is null or not is_member(p_workspace_id) then
    raise exception 'not a workspace member' using errcode = '42501';
  end if;

  select created_at into workspace_started
  from workspaces where id = p_workspace_id;

  return query
  with event_summary as (
    select
      bool_or(event_name = 'workspace_created') as has_workspace,
      bool_or(event_name = 'project_created') as has_project,
      count(distinct subject_id) filter (where event_name = 'task_created')::integer as tasks,
      bool_or(event_name = 'invitation_sent') as has_invitation,
      count(distinct actor_id) filter (where event_name = 'member_active') >= 2 as has_second_active,
      bool_or(event_name in ('workload_viewed', 'gantt_viewed')) as has_core_view,
      bool_or(event_name = 'workspace_created' and occurred_at <= workspace_started + interval '7 days') as timely_workspace,
      bool_or(event_name = 'project_created' and occurred_at <= workspace_started + interval '7 days') as timely_project,
      count(distinct subject_id) filter (
        where event_name = 'task_created'
          and occurred_at <= workspace_started + interval '7 days'
      ) >= 5 as timely_tasks,
      count(distinct actor_id) filter (
        where event_name = 'member_active'
          and occurred_at <= workspace_started + interval '7 days'
      ) >= 2 as timely_members
    from activation_events
    where workspace_id = p_workspace_id
  )
  select
    coalesce(has_workspace, false),
    coalesce(has_project, false),
    coalesce(tasks, 0),
    coalesce(has_invitation, false),
    coalesce(has_second_active, false),
    coalesce(has_core_view, false),
    coalesce(has_workspace, false)
      and coalesce(has_project, false)
      and coalesce(tasks, 0) >= 5
      and coalesce(has_invitation, false)
      and coalesce(has_second_active, false)
      and coalesce(has_core_view, false),
    coalesce(timely_workspace, false)
      and coalesce(timely_project, false)
      and coalesce(timely_tasks, false)
      and coalesce(timely_members, false),
    exists (
      select 1 from onboarding_dismissals
      where workspace_id = p_workspace_id and user_id = caller
    )
  from event_summary;
end;
$$;

-- Backfill deterministic milestones for existing workspaces without content.
insert into activation_events (workspace_id, actor_id, event_name, subject_id, occurred_at)
select id, created_by, 'workspace_created', id, created_at from workspaces
on conflict do nothing;
insert into activation_events (workspace_id, actor_id, event_name, subject_id, occurred_at)
select workspace_id, null, 'project_created', id, created_at from projects
on conflict do nothing;
insert into activation_events (workspace_id, actor_id, event_name, subject_id, occurred_at)
select workspace_id, created_by, 'task_created', id, created_at from tasks
on conflict do nothing;
insert into activation_events (workspace_id, actor_id, event_name, subject_id, occurred_at)
select workspace_id, invited_by, 'invitation_sent', id, last_sent_at from workspace_invitations
on conflict do nothing;
insert into activation_events (workspace_id, actor_id, event_name, subject_id, occurred_at)
select workspace_id, null, 'invitation_accepted', id, accepted_at
from workspace_invitations where accepted_at is not null
on conflict do nothing;

revoke execute on function capture_activation_event(uuid, uuid, text, uuid, timestamptz) from public;
revoke execute on function track_workspace_activation() from public;
revoke execute on function track_project_activation() from public;
revoke execute on function track_task_activation() from public;
revoke execute on function track_invitation_activation() from public;
revoke execute on function record_activation_signal(uuid, text) from public;
revoke execute on function get_activation_status(uuid) from public;

grant execute on function record_activation_signal(uuid, text) to authenticated;
grant execute on function get_activation_status(uuid) to authenticated;

notify pgrst, 'reload schema';
