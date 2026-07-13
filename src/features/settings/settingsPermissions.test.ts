import { describe, expect, it } from 'vitest'
import { canRemoveMember, settingsPermissions } from './settingsPermissions'

describe('settings permissions', () => {
  it('allows owners to manage roles and ownership', () => {
    expect(settingsPermissions('owner')).toEqual({
      canManage: true,
      canChangeRoles: true,
      canTransferOwnership: true,
    })
  })

  it('limits admins to ordinary administration and denies members', () => {
    expect(settingsPermissions('admin')).toMatchObject({ canManage: true, canChangeRoles: false })
    expect(settingsPermissions('member').canManage).toBe(false)
    expect(settingsPermissions(undefined).canManage).toBe(false)
  })

  it('prevents admins from removing owners', () => {
    expect(canRemoveMember('admin', 'owner')).toBe(false)
    expect(canRemoveMember('admin', 'member')).toBe(true)
    expect(canRemoveMember('owner', 'owner')).toBe(true)
  })
})
