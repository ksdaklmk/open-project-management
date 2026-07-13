-- Phase 2 collaboration notifications. Notification events are immutable and
-- privacy-safe (identifiers/timestamps only); read state is user-authored in a
-- separate relation. Email delivery is queued for an out-of-transaction worker.

create type notification_kind as enum (
  'assignment',
  'mention',
  'watched_comment',
  'status_change',
  'invitation',
  'due_soon'
);

create type notification_delivery_status as enum (
  'pending', 'processing', 'sent', 'dead'
);

create table task_watchers (
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index task_watchers_user_idx on task_watchers (user_id, created_at desc);

create table comment_mentions (
  comment_id uuid not null references comments(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index comment_mentions_user_idx on comment_mentions (user_id, created_at desc);

create table notification_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  assignments boolean not null default true,
  mentions boolean not null default true,
  watched_comments boolean not null default true,
  status_changes boolean not null default true,
  invitations boolean not null default true,
  due_soon boolean not null default true,
  email_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  kind notification_kind not null,
  task_id uuid references tasks(id) on delete set null,
  task_ref_snapshot text,
  comment_id uuid references comments(id) on delete set null,
  invitation_id uuid references workspace_invitations(id) on delete set null,
  dedupe_key text not null check (length(dedupe_key) between 1 and 300),
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key),
  constraint notifications_subject_valid check (
    (kind = 'invitation' and invitation_id is not null)
    or (kind <> 'invitation' and task_id is not null and task_ref_snapshot is not null)
  )
);
create index notifications_user_cursor_idx on notifications (user_id, created_at desc, id desc);

create table notification_reads (
  notification_id uuid not null references notifications(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);
create index notification_reads_user_idx on notification_reads (user_id, read_at desc);

create table notification_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references notifications(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status notification_delivery_status not null default 'pending',
  attempts integer not null default 0 check (attempts between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  processed_at timestamptz,
  last_error_code text check (last_error_code is null or length(last_error_code) <= 80),
  created_at timestamptz not null default now()
);
create index notification_outbox_pending_idx
  on notification_outbox (next_attempt_at, created_at)
  where status = 'pending';

alter table task_watchers enable row level security;
alter table comment_mentions enable row level security;
alter table notification_preferences enable row level security;
alter table notifications enable row level security;
alter table notification_reads enable row level security;
alter table notification_outbox enable row level security;

create policy task_watcher_read on task_watchers for select using (
  exists (select 1 from tasks task
          where task.id = task_id and is_member(task.workspace_id))
);

create policy comment_mention_read on comment_mentions for select using (
  exists (
    select 1 from comments comment
    join tasks task on task.id = comment.task_id
    where comment.id = comment_id and is_member(task.workspace_id)
  )
);

create policy notification_preference_read on notification_preferences for select
  using (user_id = auth.uid());
create policy notification_preference_insert on notification_preferences for insert
  with check (user_id = auth.uid());
create policy notification_preference_update on notification_preferences for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notification_read on notifications for select
  using (user_id = auth.uid());

create policy notification_read_state_select on notification_reads for select
  using (
    user_id = auth.uid()
    and exists (select 1 from notifications notification
                where notification.id = notification_id
                  and notification.user_id = auth.uid())
  );
create policy notification_read_state_insert on notification_reads for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from notifications notification
                where notification.id = notification_id
                  and notification.user_id = auth.uid())
  );

-- The API can only read watcher/mention relations. Their writes, notification
-- creation, and outbox writes all cross a validated SECURITY DEFINER boundary.
grant select on task_watchers, comment_mentions, notifications to authenticated;
grant select, insert, update on notification_preferences to authenticated;
grant select, insert on notification_reads to authenticated;
grant select, insert, update, delete on notification_outbox to service_role;

create trigger notification_preferences_updated_at
before update on notification_preferences
for each row execute function set_updated_at();

-- Internal idempotent enqueue boundary. A preference row is optional: in-app
-- events default on and email defaults off. Non-invitation targets must still
-- be members when the event is created.
create or replace function enqueue_notification(
  p_workspace_id uuid,
  p_user_id uuid,
  p_actor_id uuid,
  p_kind notification_kind,
  p_task_id uuid,
  p_comment_id uuid,
  p_invitation_id uuid,
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_id uuid;
  task_ref text;
  event_enabled boolean := true;
  email_enabled boolean := false;
begin
  if p_user_id is null or p_user_id = p_actor_id then
    return null;
  end if;

  if p_kind = 'invitation' then
    if p_invitation_id is null or not exists (
      select 1 from workspace_invitations invitation
      where invitation.id = p_invitation_id
        and invitation.workspace_id = p_workspace_id
        and invitation.revoked_at is null
    ) then
      return null;
    end if;
  else
    if not exists (
      select 1 from workspace_members member
      where member.workspace_id = p_workspace_id and member.user_id = p_user_id
    ) then
      return null;
    end if;
    select task.ref into task_ref
    from tasks task
    where task.id = p_task_id and task.workspace_id = p_workspace_id;
    if task_ref is null then return null; end if;
  end if;

  select
    case p_kind
      when 'assignment' then preference.assignments
      when 'mention' then preference.mentions
      when 'watched_comment' then preference.watched_comments
      when 'status_change' then preference.status_changes
      when 'invitation' then preference.invitations
      when 'due_soon' then preference.due_soon
    end,
    preference.email_enabled
  into event_enabled, email_enabled
  from notification_preferences preference
  where preference.user_id = p_user_id;
  event_enabled := coalesce(event_enabled, true);
  email_enabled := coalesce(email_enabled, false);
  if not event_enabled then return null; end if;

  insert into notifications (
    workspace_id, user_id, actor_id, kind, task_id, task_ref_snapshot,
    comment_id, invitation_id, dedupe_key
  ) values (
    p_workspace_id, p_user_id, p_actor_id, p_kind, p_task_id, task_ref,
    p_comment_id, p_invitation_id, p_dedupe_key
  )
  on conflict (user_id, dedupe_key) do nothing
  returning id into notification_id;

  if notification_id is not null and email_enabled then
    insert into notification_outbox (notification_id, user_id)
    values (notification_id, p_user_id)
    on conflict (notification_id) do nothing;
  end if;
  return notification_id;
end;
$$;

create or replace function notify_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare watcher record;
declare actor uuid := auth.uid();
declare minute_bucket text := to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform enqueue_notification(
      new.workspace_id, new.assignee_id, actor, 'assignment', new.id, null, null,
      'assignment:' || new.id || ':' || new.assignee_id || ':' || minute_bucket
    );
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    for watcher in select user_id from task_watchers where task_id = new.id loop
      perform enqueue_notification(
        new.workspace_id, watcher.user_id, actor, 'status_change', new.id, null, null,
        'status:' || new.id || ':' || new.status || ':' || minute_bucket
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger notification_task_change
after insert or update of assignee_id, status on tasks
for each row execute function notify_task_change();

create or replace function notify_comment_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare comment_row comments%rowtype;
declare task_row tasks%rowtype;
begin
  select * into strict comment_row from comments where id = new.comment_id;
  select * into strict task_row from tasks where id = comment_row.task_id;
  perform enqueue_notification(
    task_row.workspace_id, new.user_id, comment_row.author_id, 'mention',
    task_row.id, comment_row.id, null, 'comment:' || comment_row.id
  );
  return new;
end;
$$;

create trigger notification_comment_mention
after insert on comment_mentions
for each row execute function notify_comment_mention();

-- Deferred until transaction commit so create_comment can persist normalized
-- mentions first. Mentioned watchers receive one mention, not a duplicate
-- watched-comment event. Direct legacy comment inserts still notify watchers.
create or replace function notify_comment_watchers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare task_row tasks%rowtype;
declare watcher record;
begin
  select * into strict task_row from tasks where id = new.task_id;
  for watcher in
    select watched.user_id
    from task_watchers watched
    where watched.task_id = new.task_id
      and not exists (
        select 1 from comment_mentions mention
        where mention.comment_id = new.id and mention.user_id = watched.user_id
      )
  loop
    perform enqueue_notification(
      task_row.workspace_id, watcher.user_id, new.author_id, 'watched_comment',
      task_row.id, new.id, null, 'comment:' || new.id
    );
  end loop;
  return new;
end;
$$;

create constraint trigger notification_comment_watchers
after insert on comments deferrable initially deferred
for each row execute function notify_comment_watchers();

create or replace function notify_invitation_target()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare target_user uuid;
declare minute_bucket text := to_char(date_trunc('minute', new.last_sent_at), 'YYYYMMDDHH24MI');
begin
  if tg_op = 'UPDATE' and new.last_sent_at is not distinct from old.last_sent_at then
    return new;
  end if;
  select invited_user.id into target_user
  from auth.users invited_user
  where lower(btrim(invited_user.email)) = new.email_normalized
  limit 1;
  if target_user is not null then
    perform public.enqueue_notification(
      new.workspace_id, target_user, new.invited_by, 'invitation',
      null, null, new.id, 'invitation:' || new.id || ':' || minute_bucket
    );
  end if;
  return new;
end;
$$;

create trigger notification_invitation_change
after insert or update of last_sent_at on workspace_invitations
for each row execute function notify_invitation_target();

-- Comment creation and mention extraction are atomic. The client supplies
-- member IDs selected by autocomplete; the server rejects foreign targets.
create or replace function create_comment(
  p_task_id uuid,
  p_body text,
  p_mentioned_user_ids uuid[] default '{}'::uuid[]
)
returns comments
language plpgsql
security definer
set search_path = public
as $$
declare caller uuid := auth.uid();
declare task_row tasks%rowtype;
declare comment_row comments%rowtype;
declare mention_count integer;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into task_row from tasks where id = p_task_id;
  if task_row.id is null or not is_member(task_row.workspace_id) then
    raise exception 'not a member of this task workspace' using errcode = '42501';
  end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'comment body is required' using errcode = '22023';
  end if;

  select count(distinct mentioned_id) into mention_count
  from unnest(coalesce(p_mentioned_user_ids, '{}'::uuid[])) mentioned_id;
  if mention_count > 20 then
    raise exception 'a comment can mention at most 20 members' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_mentioned_user_ids, '{}'::uuid[])) mentioned_id
    where not exists (
      select 1 from workspace_members member
      where member.workspace_id = task_row.workspace_id
        and member.user_id = mentioned_id
    )
  ) then
    raise exception 'mentioned users must belong to the task workspace' using errcode = '42501';
  end if;

  insert into comments (task_id, author_id, body)
  values (p_task_id, caller, btrim(p_body))
  returning * into comment_row;

  insert into comment_mentions (comment_id, user_id)
  select comment_row.id, mentioned_id
  from (
    select distinct mentioned_id
    from unnest(coalesce(p_mentioned_user_ids, '{}'::uuid[])) mentioned_id
  ) mentions
  where mentioned_id <> caller
  on conflict do nothing;

  return comment_row;
end;
$$;

create or replace function set_task_watched(p_task_id uuid, p_watching boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare caller uuid := auth.uid();
declare task_workspace uuid;
begin
  select workspace_id into task_workspace from tasks where id = p_task_id;
  if caller is null or task_workspace is null or not is_member(task_workspace) then
    raise exception 'not a member of this task workspace' using errcode = '42501';
  end if;
  if coalesce(p_watching, false) then
    insert into task_watchers (task_id, user_id) values (p_task_id, caller)
    on conflict do nothing;
  else
    delete from task_watchers where task_id = p_task_id and user_id = caller;
  end if;
  return coalesce(p_watching, false);
end;
$$;

create or replace function is_task_watched(p_task_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare task_workspace uuid;
begin
  select workspace_id into task_workspace from tasks where id = p_task_id;
  if auth.uid() is null or task_workspace is null or not is_member(task_workspace) then
    raise exception 'not a member of this task workspace' using errcode = '42501';
  end if;
  return exists (
    select 1 from task_watchers
    where task_id = p_task_id and user_id = auth.uid()
  );
end;
$$;

create or replace function query_inbox(
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  workspace_id uuid,
  actor_id uuid,
  kind notification_kind,
  task_id uuid,
  task_ref text,
  comment_id uuid,
  invitation_id uuid,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception 'cursor timestamp and id must be supplied together' using errcode = '22023';
  end if;
  return query
  select
    notification.id,
    notification.workspace_id,
    notification.actor_id,
    notification.kind,
    notification.task_id,
    notification.task_ref_snapshot,
    notification.comment_id,
    notification.invitation_id,
    notification.created_at,
    read_state.read_at
  from notifications notification
  left join notification_reads read_state
    on read_state.notification_id = notification.id
   and read_state.user_id = caller
  where notification.user_id = caller
    and (
      p_cursor_created_at is null
      or (notification.created_at, notification.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by notification.created_at desc, notification.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100) + 1;
end;
$$;

create or replace function get_unread_notification_count()
returns integer
language plpgsql
security definer
stable
set search_path = public
as $$
declare caller uuid := auth.uid();
declare unread_count integer;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select count(*)::integer into unread_count
  from notifications notification
  where notification.user_id = caller
    and not exists (
      select 1 from notification_reads read_state
      where read_state.notification_id = notification.id
        and read_state.user_id = caller
    );
  return unread_count;
end;
$$;

create or replace function mark_all_notifications_read()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare caller uuid := auth.uid();
declare inserted_count bigint;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  with inserted as (
    insert into notification_reads (notification_id, user_id)
    select notification.id, caller
    from notifications notification
    where notification.user_id = caller
    on conflict do nothing
    returning 1
  )
  select count(*) into inserted_count from inserted;
  return inserted_count;
end;
$$;

-- Scheduled service-role job. Repeated calls create at most one due event per
-- user/task/due-date, including when a user is both assignee and watcher.
create or replace function enqueue_due_notifications(p_days integer default 3)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare target record;
declare notification_id uuid;
declare inserted_count bigint := 0;
begin
  if p_days is null or p_days not between 0 and 30 then
    raise exception 'due notification window must be between 0 and 30 days'
      using errcode = '22023';
  end if;
  for target in
    select distinct task.id as task_id, task.workspace_id, task.end_date, recipient.user_id
    from tasks task
    cross join lateral (
      select task.assignee_id as user_id where task.assignee_id is not null
      union
      select watcher.user_id from task_watchers watcher where watcher.task_id = task.id
    ) recipient
    join workspace_members member
      on member.workspace_id = task.workspace_id and member.user_id = recipient.user_id
    where task.status <> 'done'
      and task.end_date between current_date and current_date + p_days
  loop
    notification_id := enqueue_notification(
      target.workspace_id, target.user_id, null, 'due_soon', target.task_id,
      null, null, 'due:' || target.task_id || ':' || target.end_date
    );
    if notification_id is not null then inserted_count := inserted_count + 1; end if;
  end loop;
  return inserted_count;
end;
$$;

-- Claim/complete functions form the worker lease boundary. The worker gets
-- only recipient address plus enum/identifier metadata, never task or comment
-- content. SKIP LOCKED permits safe concurrent scheduled invocations.
create or replace function claim_notification_outbox(p_limit integer default 25)
returns table (
  outbox_id uuid,
  notification_id uuid,
  recipient_email text,
  notification_kind notification_kind,
  task_ref text,
  workspace_id uuid,
  attempts integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return query
  with claimable as (
    select delivery.id
    from public.notification_outbox delivery
    where delivery.status = 'pending' and delivery.next_attempt_at <= now()
    order by delivery.next_attempt_at, delivery.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  ), claimed as (
    update public.notification_outbox delivery
    set status = 'processing', claimed_at = now(), attempts = delivery.attempts + 1
    from claimable
    where delivery.id = claimable.id
    returning delivery.*
  )
  select
    claimed.id,
    claimed.notification_id,
    invited_user.email::text,
    notification.kind,
    notification.task_ref_snapshot,
    notification.workspace_id,
    claimed.attempts
  from claimed
  join public.notifications notification on notification.id = claimed.notification_id
  join auth.users invited_user on invited_user.id = claimed.user_id;
end;
$$;

create or replace function complete_notification_delivery(
  p_outbox_id uuid,
  p_succeeded boolean,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update notification_outbox delivery
  set status = case
        when coalesce(p_succeeded, false) then 'sent'::notification_delivery_status
        when delivery.attempts >= 5 then 'dead'::notification_delivery_status
        else 'pending'::notification_delivery_status
      end,
      processed_at = case when coalesce(p_succeeded, false) then now() else null end,
      claimed_at = null,
      next_attempt_at = case
        when coalesce(p_succeeded, false) then delivery.next_attempt_at
        else now() + make_interval(mins => least(60, greatest(1, delivery.attempts * 5)))
      end,
      last_error_code = case
        when coalesce(p_succeeded, false) then null
        else left(coalesce(p_error_code, 'delivery_failed'), 80)
      end
  where delivery.id = p_outbox_id and delivery.status = 'processing';
end;
$$;

revoke execute on function enqueue_notification(uuid, uuid, uuid, notification_kind, uuid, uuid, uuid, text) from public;
revoke execute on function notify_task_change() from public;
revoke execute on function notify_comment_mention() from public;
revoke execute on function notify_comment_watchers() from public;
revoke execute on function notify_invitation_target() from public;
revoke execute on function create_comment(uuid, text, uuid[]) from public;
revoke execute on function set_task_watched(uuid, boolean) from public;
revoke execute on function is_task_watched(uuid) from public;
revoke execute on function query_inbox(timestamptz, uuid, integer) from public;
revoke execute on function get_unread_notification_count() from public;
revoke execute on function mark_all_notifications_read() from public;
revoke execute on function enqueue_due_notifications(integer) from public;
revoke execute on function claim_notification_outbox(integer) from public;
revoke execute on function complete_notification_delivery(uuid, boolean, text) from public;

grant execute on function create_comment(uuid, text, uuid[]) to authenticated;
grant execute on function set_task_watched(uuid, boolean) to authenticated;
grant execute on function is_task_watched(uuid) to authenticated;
grant execute on function query_inbox(timestamptz, uuid, integer) to authenticated;
grant execute on function get_unread_notification_count() to authenticated;
grant execute on function mark_all_notifications_read() to authenticated;
grant execute on function enqueue_due_notifications(integer) to service_role;
grant execute on function claim_notification_outbox(integer) to service_role;
grant execute on function complete_notification_delivery(uuid, boolean, text) to service_role;

-- User-scoped Realtime events invalidate Inbox/read-count queries. RLS still
-- filters every replication payload to the signed-in recipient.
do $$
declare table_name text;
begin
  foreach table_name in array array['notifications', 'notification_reads'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
