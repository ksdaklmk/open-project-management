import { describe, it, expect, vi, beforeEach } from 'vitest'

const { limit, order, eq, select, from } = vi.hoisted(() => {
  const limit = vi.fn()
  const order = vi.fn(() => ({ limit }))
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { limit, order, eq, select, from }
})
vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { listActivity } from './activityRepo'

beforeEach(() => vi.clearAllMocks())

const ROW = {
  id: 'a1',
  verb: 'moved',
  from_status: 'todo',
  to_status: 'done',
  created_at: '2026-06-27T10:00:00Z',
  actor: { name: 'Dana', color: '#abc' },
  task: { ref: 'NIM-101', title: 'Fix login' },
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
      data: [
        {
          id: 'a2',
          verb: 'moved',
          from_status: null,
          to_status: null,
          created_at: 'x',
          actor: null,
          task: null,
        },
      ],
      error: null,
    })
    const [item] = await listActivity('w1')
    expect(item.actor).toBeNull()
    expect(item.task).toBeNull()
  })

  it('uses the immutable task snapshot after task deletion', async () => {
    limit.mockResolvedValueOnce({
      data: [
        {
          ...ROW,
          verb: 'deleted',
          task: null,
          task_ref_snapshot: 'NIM-101',
          task_title_snapshot: 'Deleted task',
        },
      ],
      error: null,
    })
    const [item] = await listActivity('w1')
    expect(item.task).toEqual({ ref: 'NIM-101', title: 'Deleted task' })
  })

  it('throws on a Supabase error', async () => {
    limit.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(listActivity('w1')).rejects.toThrow('boom')
  })
})
