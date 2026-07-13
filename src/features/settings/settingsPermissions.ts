import type { Database } from '../../types/database'

export type MemberRole = Database['public']['Enums']['member_role']

export interface SettingsPermissions {
  canManage: boolean
  canChangeRoles: boolean
  canTransferOwnership: boolean
}

export function settingsPermissions(role: MemberRole | undefined): SettingsPermissions {
  return {
    canManage: role === 'owner' || role === 'admin',
    canChangeRoles: role === 'owner',
    canTransferOwnership: role === 'owner',
  }
}

export function canRemoveMember(
  actorRole: MemberRole | undefined,
  targetRole: MemberRole,
): boolean {
  if (actorRole === 'owner') return true
  return actorRole === 'admin' && targetRole !== 'owner'
}
