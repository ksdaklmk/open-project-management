import { describe, it, expect, vi, beforeEach } from 'vitest'

const { eq, select: _select, from } = vi.hoisted(() => {
  const eq = vi.fn()
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { eq, select, from }
})
vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { listMembers } from './membersRepo'

beforeEach(() => vi.clearAllMocks())

describe('membersRepo.listMembers', () => {
  it('returns members with the joined profile name, scoped to the workspace', async () => {
    eq.mockResolvedValueOnce({
      data: [{ user_id: 'u1', role: 'owner', capacity_per_week: 40, color: '#abc', profiles: { name: 'Ada' } }],
      error: null,
    })
    const out = await listMembers('w1')
    expect(from).toHaveBeenCalledWith('workspace_members')
    expect(eq).toHaveBeenCalledWith('workspace_id', 'w1')
    expect(out).toEqual([{ user_id: 'u1', role: 'owner', capacity_per_week: 40, color: '#abc', name: 'Ada' }])
  })
  it('defaults name to empty string when the profile join is null', async () => {
    eq.mockResolvedValueOnce({
      data: [{ user_id: 'u2', role: 'member', capacity_per_week: 40, color: '#def', profiles: null }],
      error: null,
    })
    const out = await listMembers('w1')
    expect(out[0].name).toBe('')
  })
})
