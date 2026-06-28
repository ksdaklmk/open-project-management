import { describe, it, expect, vi, beforeEach } from 'vitest'

const { order, eq, select, insert, update, updateEq, del, delEq, from } = vi.hoisted(() => {
  const order = vi.fn()
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const insert = vi.fn(() => Promise.resolve({ error: null }))
  const updateEq = vi.fn(() => Promise.resolve({ error: null }))
  const update = vi.fn(() => ({ eq: updateEq }))
  const delEq = vi.fn(() => Promise.resolve({ error: null }))
  const del = vi.fn(() => ({ eq: delEq }))
  const from = vi.fn(() => ({ select, insert, update, delete: del }))
  return { order, eq, select, insert, update, updateEq, del, delEq, from }
})
vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { listSubtasks, addSubtask, toggleSubtask, deleteSubtask } from './subtasksRepo'

beforeEach(() => vi.clearAllMocks())

describe('subtasksRepo', () => {
  it('lists subtasks for a task ordered by position', async () => {
    order.mockResolvedValueOnce({ data: [{ id: 's1' }], error: null })
    const rows = await listSubtasks('t1')
    expect(from).toHaveBeenCalledWith('subtasks')
    expect(eq).toHaveBeenCalledWith('task_id', 't1')
    expect(order).toHaveBeenCalledWith('position', { ascending: true })
    expect(rows).toEqual([{ id: 's1' }])
  })
  it('adds a subtask with title + position', async () => {
    await addSubtask('t1', 'Write tests', 2)
    expect(insert).toHaveBeenCalledWith({ task_id: 't1', title: 'Write tests', position: 2 })
  })
  it('toggles done scoped by id', async () => {
    await toggleSubtask('s1', true)
    expect(update).toHaveBeenCalledWith({ done: true })
    expect(updateEq).toHaveBeenCalledWith('id', 's1')
  })
  it('deletes scoped by id', async () => {
    await deleteSubtask('s1')
    expect(delEq).toHaveBeenCalledWith('id', 's1')
  })
  it('throws on error', async () => {
    order.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(listSubtasks('t1')).rejects.toThrow('boom')
  })
})
