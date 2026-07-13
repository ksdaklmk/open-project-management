-- Keep notification visibility tenant-scoped after membership removal and
-- lock read/preference timestamps behind server defaults/triggers.

drop policy notification_read on notifications;
create policy notification_read on notifications for select using (
  user_id = auth.uid()
  and (kind = 'invitation' or is_member(workspace_id))
);

revoke insert, update on notification_preferences from authenticated;
grant insert (
  user_id, assignments, mentions, watched_comments, status_changes,
  invitations, due_soon, email_enabled
) on notification_preferences to authenticated;
grant update (
  assignments, mentions, watched_comments, status_changes,
  invitations, due_soon, email_enabled
) on notification_preferences to authenticated;

revoke insert on notification_reads from authenticated;
grant insert (notification_id, user_id) on notification_reads to authenticated;

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
    and (notification.kind = 'invitation' or is_member(notification.workspace_id))
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
    and (notification.kind = 'invitation' or is_member(notification.workspace_id))
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
      and (notification.kind = 'invitation' or is_member(notification.workspace_id))
    on conflict do nothing
    returning 1
  )
  select count(*) into inserted_count from inserted;
  return inserted_count;
end;
$$;

notify pgrst, 'reload schema';
