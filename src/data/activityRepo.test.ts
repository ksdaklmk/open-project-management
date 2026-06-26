import { describe, it, expect, vi, beforeEach } from 'vitest'

const { insert, from } = vi.hoisted(() => {
  const insert = vi.fn()
  const from = vi.fn(() => ({ insert }))
  return { insert, from }
})
vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { logMove } from './activityRepo'

beforeEach(() => vi.clearAllMocks())

describe('activityRepo.logMove', () => {
  it('inserts a moved activity row', async () => {
    insert.mockResolvedValueOnce({ error: null })
    await logMove({ workspaceId: 'w1', actorId: 'u1', taskId: 't1', fromStatus: 'todo', toStatus: 'done' })
    expect(from).toHaveBeenCalledWith('activity')
    expect(insert).toHaveBeenCalledWith({
      workspace_id: 'w1', actor_id: 'u1', task_id: 't1',
      verb: 'moved', from_status: 'todo', to_status: 'done',
    })
  })
  it('throws on error', async () => {
    insert.mockResolvedValueOnce({ error: { message: 'boom' } })
    await expect(logMove({ workspaceId: 'w1', actorId: 'u1', taskId: 't1', fromStatus: 'todo', toStatus: 'done' }))
      .rejects.toThrow('boom')
  })
})
