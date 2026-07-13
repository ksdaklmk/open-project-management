import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'
import { throwAdminError } from './adminErrors'

export interface Member {
  user_id: string
  role: Database['public']['Enums']['member_role']
  capacity_per_week: number
  color: string
  name: string
}

export async function listMembers(workspaceId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('user_id, role, capacity_per_week, color, profiles(name)')
    .eq('workspace_id', workspaceId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((m) => {
    const profile = m.profiles as { name: string } | null
    return {
      user_id: m.user_id,
      role: m.role,
      capacity_per_week: m.capacity_per_week,
      color: m.color,
      name: profile?.name ?? '',
    }
  })
}

type MemberRow = Database['public']['Tables']['workspace_members']['Row']
type MemberRole = Database['public']['Enums']['member_role']

export async function setMemberRole(
  workspaceId: string,
  userId: string,
  role: Exclude<MemberRole, 'owner'>,
): Promise<MemberRow> {
  const { data, error } = await supabase.rpc('set_member_role', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_role: role,
  })
  if (error) throwAdminError(error)
  return data
}

export async function setMemberCapacity(
  workspaceId: string,
  userId: string,
  capacity: number,
): Promise<MemberRow> {
  const { data, error } = await supabase.rpc('set_member_capacity', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_capacity: capacity,
  })
  if (error) throwAdminError(error)
  return data
}

export interface RemovedMember {
  removedUserId: string
  unassignedTaskCount: number
}

export async function removeWorkspaceMember(
  workspaceId: string,
  userId: string,
): Promise<RemovedMember> {
  const { data, error } = await supabase.rpc('remove_workspace_member', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  })
  if (error) throwAdminError(error)
  const removed = data?.[0]
  if (!removed) throw new Error('Member removal returned no result.')
  return {
    removedUserId: removed.removed_user_id,
    unassignedTaskCount: removed.unassigned_task_count,
  }
}

export interface OwnershipTransfer {
  previousOwnerId: string
  newOwnerId: string
}

export async function transferWorkspaceOwnership(
  workspaceId: string,
  newOwnerId: string,
): Promise<OwnershipTransfer> {
  const { data, error } = await supabase.rpc('transfer_workspace_ownership', {
    p_workspace_id: workspaceId,
    p_new_owner_id: newOwnerId,
  })
  if (error) throwAdminError(error)
  const transfer = data?.[0]
  if (!transfer) throw new Error('Ownership transfer returned no result.')
  return { previousOwnerId: transfer.previous_owner_id, newOwnerId: transfer.new_owner_id }
}
