import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  eq,
  select: _select,
  from,
  rpc,
} = vi.hoisted(() => {
  const eq = vi.fn()
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  const rpc = vi.fn()
  return { eq, select, from, rpc }
})
vi.mock('../lib/supabase', () => ({ supabase: { from, rpc } }))

import {
  listMembers,
  removeWorkspaceMember,
  setMemberCapacity,
  setMemberRole,
  transferWorkspaceOwnership,
} from './membersRepo'

beforeEach(() => vi.clearAllMocks())

describe('membersRepo.listMembers', () => {
  it('returns members with the joined profile name, scoped to the workspace', async () => {
    eq.mockResolvedValueOnce({
      data: [
        {
          user_id: 'u1',
          role: 'owner',
          capacity_per_week: 40,
          color: '#abc',
          profiles: { name: 'Ada' },
        },
      ],
      error: null,
    })
    const out = await listMembers('w1')
    expect(from).toHaveBeenCalledWith('workspace_members')
    expect(eq).toHaveBeenCalledWith('workspace_id', 'w1')
    expect(out).toEqual([
      { user_id: 'u1', role: 'owner', capacity_per_week: 40, color: '#abc', name: 'Ada' },
    ])
  })
  it('defaults name to empty string when the profile join is null', async () => {
    eq.mockResolvedValueOnce({
      data: [
        { user_id: 'u2', role: 'member', capacity_per_week: 40, color: '#def', profiles: null },
      ],
      error: null,
    })
    const out = await listMembers('w1')
    expect(out[0].name).toBe('')
  })
})

describe('member administration', () => {
  it('routes role and capacity changes through RPCs', async () => {
    rpc.mockResolvedValue({ data: { user_id: 'u1' }, error: null })
    await setMemberRole('w1', 'u1', 'admin')
    await setMemberCapacity('w1', 'u1', 32)
    expect(rpc.mock.calls).toEqual([
      ['set_member_role', { p_workspace_id: 'w1', p_user_id: 'u1', p_role: 'admin' }],
      ['set_member_capacity', { p_workspace_id: 'w1', p_user_id: 'u1', p_capacity: 32 }],
    ])
  })

  it('normalises member removal and ownership transfer results', async () => {
    rpc
      .mockResolvedValueOnce({
        data: [{ removed_user_id: 'u2', unassigned_task_count: 3 }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ previous_owner_id: 'u1', new_owner_id: 'u2' }],
        error: null,
      })
    await expect(removeWorkspaceMember('w1', 'u2')).resolves.toEqual({
      removedUserId: 'u2',
      unassignedTaskCount: 3,
    })
    await expect(transferWorkspaceOwnership('w1', 'u2')).resolves.toEqual({
      previousOwnerId: 'u1',
      newOwnerId: 'u2',
    })
  })

  it('maps final-owner failures to actionable copy', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23514', message: 'workspace_members_owner_required' },
    })
    await expect(removeWorkspaceMember('w1', 'u1')).rejects.toThrow('Transfer ownership')
  })
})
