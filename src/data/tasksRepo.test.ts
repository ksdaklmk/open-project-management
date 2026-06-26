import { describe, it, expect, vi, beforeEach } from 'vitest'

const { order, eq, select: _select, update, updateEq, from } = vi.hoisted(() => {
  const order = vi.fn()
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const updateEq = vi.fn(() => Promise.resolve({ error: null }))
  const update = vi.fn(() => ({ eq: updateEq }))
  const from = vi.fn(() => ({ select, update }))
  return { order, eq, select, update, updateEq, from }
})

vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { listTasks, updateTask } from './tasksRepo'

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

  it('updates a task with a partial patch, scoped by id', async () => {
    await updateTask('t1', { status: 'done', priority: 'high' })
    expect(from).toHaveBeenCalledWith('tasks')
    expect(update).toHaveBeenCalledWith({ status: 'done', priority: 'high' })
    expect(updateEq).toHaveBeenCalledWith('id', 't1')
  })
})
