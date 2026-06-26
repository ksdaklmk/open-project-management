import { describe, it, expect, vi, beforeEach } from 'vitest'

const { order, eq, select: _select, update, from } = vi.hoisted(() => {
  const order = vi.fn()
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
  const from = vi.fn(() => ({ select, update }))
  return { order, eq, select, update, from }
})

vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { listTasks, updateTaskStatus } from './tasksRepo'

beforeEach(() => vi.clearAllMocks())

describe('tasksRepo', () => {
  it('lists tasks for a workspace ordered by position', async () => {
    order.mockResolvedValueOnce({ data: [{ id: 't1', ref: 'NIM-101' }], error: null })
    const tasks = await listTasks('ws-1')
    expect(from).toHaveBeenCalledWith('tasks')
    expect(eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(order).toHaveBeenCalledWith('position', { ascending: true })
    expect(tasks).toEqual([{ id: 't1', ref: 'NIM-101' }])
  })

  it('throws on a Supabase error', async () => {
    order.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(listTasks('ws-1')).rejects.toThrow('boom')
  })

  it('updates a task status', async () => {
    await updateTaskStatus('t1', 'done')
    expect(from).toHaveBeenCalledWith('tasks')
    expect(update).toHaveBeenCalledWith({ status: 'done' })
  })
})
