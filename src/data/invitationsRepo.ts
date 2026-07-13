import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'
import { throwAdminError } from './adminErrors'

export type Invitation = Database['public']['Tables']['workspace_invitations']['Row']
export type InvitationRole = Exclude<Database['public']['Enums']['member_role'], 'owner'>

export async function listInvitations(workspaceId: string): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from('workspace_invitations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (error) throwAdminError(error)
  return data ?? []
}

async function functionErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : 'Invitation could not be sent.'
  const context = (error as { context?: unknown } | null)?.context
  if (!(context instanceof Response)) return fallback
  try {
    const body = (await context.json()) as { error?: string }
    return body.error ?? fallback
  } catch {
    return fallback
  }
}

export async function sendInvitation(
  workspaceId: string,
  email: string,
  role: InvitationRole,
): Promise<{ invitationId: string; message: string }> {
  const { data, error } = await supabase.functions.invoke('invite-member', {
    body: { workspaceId, email, role },
  })
  if (error) throw new Error(await functionErrorMessage(error))
  return data as { invitationId: string; message: string }
}

export async function revokeInvitation(invitationId: string): Promise<Invitation> {
  const { data, error } = await supabase.rpc('revoke_workspace_invitation', {
    p_invitation_id: invitationId,
  })
  if (error) throwAdminError(error)
  return data
}

export async function acceptMyInvitations(): Promise<number> {
  const { data, error } = await supabase.rpc('accept_workspace_invitations')
  if (error) throwAdminError(error)
  return data
}
