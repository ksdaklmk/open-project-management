-- Secure, server-authorised workspace invitations.

create table workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email_normalized text not null,
  role member_role not null default 'member',
  invited_by uuid references profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint workspace_invitations_email_valid check (
    email_normalized = lower(btrim(email_normalized))
    and length(email_normalized) between 3 and 320
    and email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint workspace_invitations_role_valid check (role <> 'owner'),
  constraint workspace_invitations_expiry_valid check (expires_at > created_at),
  constraint workspace_invitations_state_valid check (
    accepted_at is null or revoked_at is null
  )
);

create unique index workspace_invitations_active_email_key
  on workspace_invitations (workspace_id, email_normalized)
  where accepted_at is null and revoked_at is null;
create index workspace_invitations_workspace_created_idx
  on workspace_invitations (workspace_id, created_at desc);

alter table workspace_invitations enable row level security;

create policy invitation_read on workspace_invitations for select
  using (has_workspace_role(workspace_id, array['owner','admin']::member_role[]));

-- Invitation writes are RPC-only so callers cannot forge provenance, extend
-- expiry indefinitely, or grant roles outside the permission contract.
grant select on workspace_invitations to authenticated;
revoke insert, update, delete on workspace_invitations from authenticated;

create or replace function upsert_workspace_invitation(
  p_workspace_id uuid,
  p_email text,
  p_role member_role default 'member'
)
returns workspace_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  normalized text := lower(btrim(p_email));
  invitation workspace_invitations%rowtype;
begin
  if caller is null
     or not has_workspace_role(p_workspace_id, array['owner','admin']::member_role[]) then
    raise exception 'not authorised to invite workspace members' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'ownership can only be transferred to an existing member'
      using errcode = '22023';
  end if;
  if p_role = 'admin'
     and not has_workspace_role(p_workspace_id, array['owner']::member_role[]) then
    raise exception 'only an owner may invite an admin' using errcode = '42501';
  end if;
  if normalized is null
     or length(normalized) not between 3 and 320
     or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'enter a valid email address' using errcode = '22023';
  end if;

  select * into invitation
  from workspace_invitations
  where workspace_id = p_workspace_id
    and email_normalized = normalized
    and accepted_at is null
    and revoked_at is null
  for update;

  if invitation.id is null then
    insert into workspace_invitations (
      workspace_id, email_normalized, role, invited_by
    ) values (
      p_workspace_id, normalized, p_role, caller
    ) returning * into invitation;
  else
    update workspace_invitations
    set role = p_role,
        invited_by = caller,
        expires_at = now() + interval '7 days',
        last_sent_at = now()
    where id = invitation.id
    returning * into invitation;
  end if;

  return invitation;
end;
$$;

create or replace function revoke_workspace_invitation(p_invitation_id uuid)
returns workspace_invitations
language plpgsql
security definer
set search_path = public
as $$
declare invitation workspace_invitations%rowtype;
begin
  select * into invitation
  from workspace_invitations
  where id = p_invitation_id
  for update;

  if invitation.id is null
     or not has_workspace_role(
       invitation.workspace_id, array['owner','admin']::member_role[]
     ) then
    raise exception 'not authorised to revoke this invitation' using errcode = '42501';
  end if;
  if invitation.role = 'admin'
     and not has_workspace_role(invitation.workspace_id, array['owner']::member_role[]) then
    raise exception 'only an owner may revoke an admin invitation' using errcode = '42501';
  end if;

  if invitation.accepted_at is null and invitation.revoked_at is null then
    update workspace_invitations set revoked_at = now()
    where id = p_invitation_id
    returning * into invitation;
  end if;
  return invitation;
end;
$$;

-- Private helper used by both the authenticated RPC and auth-user triggers.
-- It reads the verified address from auth.users rather than trusting JWT or
-- client input, then claims every matching live invitation in one transaction.
create or replace function accept_verified_invitations_for_user(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, auth
as $$
declare accepted_count bigint;
begin
  if not exists (
    select 1 from auth.users
    where id = p_user_id
      and email_confirmed_at is not null
      and email is not null
  ) then
    return 0;
  end if;

  with accepted as (
    update public.workspace_invitations invitation
    set accepted_at = now()
    from auth.users invited_user
    where invited_user.id = p_user_id
      and invitation.email_normalized = lower(btrim(invited_user.email))
      and invitation.accepted_at is null
      and invitation.revoked_at is null
      and invitation.expires_at > now()
    returning invitation.workspace_id, invitation.role
  ), inserted as (
    insert into public.workspace_members (workspace_id, user_id, role)
    select workspace_id, p_user_id, role from accepted
    on conflict (workspace_id, user_id) do nothing
    returning 1
  )
  select count(*) into accepted_count from accepted;

  return accepted_count;
end;
$$;

create or replace function accept_workspace_invitations()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return accept_verified_invitations_for_user(caller);
end;
$$;

create or replace function accept_invitations_after_auth_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null then
    perform accept_verified_invitations_for_user(new.id);
  end if;
  return new;
end;
$$;

-- The profile trigger created by 0002 sorts before these names, so a profile
-- exists before a confirmed OAuth insert attempts to add memberships.
create trigger z_accept_invitations_on_auth_user_insert
after insert on auth.users
for each row execute function accept_invitations_after_auth_change();

create trigger z_accept_invitations_on_auth_user_confirmation
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function accept_invitations_after_auth_change();

revoke execute on function upsert_workspace_invitation(uuid, text, member_role) from public;
revoke execute on function revoke_workspace_invitation(uuid) from public;
revoke execute on function accept_verified_invitations_for_user(uuid) from public;
revoke execute on function accept_workspace_invitations() from public;
revoke execute on function accept_invitations_after_auth_change() from public;

grant execute on function upsert_workspace_invitation(uuid, text, member_role) to authenticated;
grant execute on function revoke_workspace_invitation(uuid) to authenticated;
grant execute on function accept_workspace_invitations() to authenticated;

notify pgrst, 'reload schema';
