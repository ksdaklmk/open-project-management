-- Forward fix for 0021: qualify the outbox conflict target so PL/pgSQL does
-- not confuse it with enqueue_notification's local notification_id variable.

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
  created_notification_id uuid;
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
  returning id into created_notification_id;

  if created_notification_id is not null and email_enabled then
    insert into notification_outbox (notification_id, user_id)
    values (created_notification_id, p_user_id)
    on conflict on constraint notification_outbox_notification_id_key do nothing;
  end if;
  return created_notification_id;
end;
$$;

revoke execute on function enqueue_notification(uuid, uuid, uuid, notification_kind, uuid, uuid, uuid, text) from public;

notify pgrst, 'reload schema';
