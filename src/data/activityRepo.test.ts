import { describe, it, expect, vi, beforeEach } from 'vitest'

const { insert, limit, order, eq, select, from } = vi.hoisted(() => {
  const insert = vi.fn()
  const limit = vi.fn()
  const order = vi.fn(() => ({ limit }))
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ insert, select }))
  return { insert, limit, order, eq, select, from }
})
vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { logMove, logComment, logCreate, listActivity } from './activityRepo'

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

describe('activityRepo.logComment', () => {
  it('inserts a commented activity row', async () => {
    insert.mockResolvedValueOnce({ error: null })
    await logComment({ workspaceId: 'w1', actorId: 'u1', taskId: 't1' })
    expect(from).toHaveBeenCalledWith('activity')
    expect(insert).toHaveBeenCalledWith({
      workspace_id: 'w1', actor_id: 'u1', task_id: 't1', verb: 'commented',
    })
  })
  it('throws on error', async () => {
    insert.mockResolvedValueOnce({ error: { message: 'boom' } })
    await expect(logComment({ workspaceId: 'w1', actorId: 'u1', taskId: 't1' })).rejects.toThrow('boom')
  })

  it('logs a created activity row', async () => {
    insert.mockResolvedValueOnce({ error: null })
    await logCreate({ workspaceId: 'w1', actorId: 'u1', taskId: 't1' })
    expect(from).toHaveBeenCalledWith('activity')
    expect(insert).toHaveBeenCalledWith({
      workspace_id: 'w1', actor_id: 'u1', task_id: 't1', verb: 'created',
    })
  })
})

const ROW = {
  id: 'a1', verb: 'moved', from_status: 'todo', to_status: 'done',
  created_at: '2026-06-27T10:00:00Z',
  actor: { name: 'Dana', color: '#abc' }, task: { ref: 'NIM-101', title: 'Fix login' },
}

describe('activityRepo.listActivity', () => {
  it('reads workspace activity newest-first, capped at 100, with actor + task joined', async () => {
    limit.mockResolvedValueOnce({ data: [ROW], error: null })
    const items = await listActivity('w1')
    expect(from).toHaveBeenCalledWith('activity')
    expect(select).toHaveBeenCalledWith(expect.stringContaining('actor:profiles!actor_id'))
    expect(select).toHaveBeenCalledWith(expect.stringContaining('task:tasks!task_id'))
    expect(eq).toHaveBeenCalledWith('workspace_id', 'w1')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(limit).toHaveBeenCalledWith(100)
    expect(items[0]).toEqual(ROW)
  })

  it('maps null actor/task without throwing', async () => {
    limit.mockResolvedValueOnce({
      data: [{ id: 'a2', verb: 'moved', from_status: null, to_status: null, created_at: 'x', actor: null, task: null }],
      error: null,
    })
    const [item] = await listActivity('w1')
    expect(item.actor).toBeNull()
    expect(item.task).toBeNull()
  })

  it('throws on a Supabase error', async () => {
    limit.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(listActivity('w1')).rejects.toThrow('boom')
  })
})
