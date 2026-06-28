import { describe, it, expect, vi, beforeEach } from 'vitest'

const { order, eq, select: _select, update, updateEq, insert, del, delEq1, delEq2, from } =
  vi.hoisted(() => {
    const order = vi.fn()
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    const updateEq = vi.fn(() => Promise.resolve({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))
    const insert = vi.fn(() => Promise.resolve({ error: null }))
    const delEq2 = vi.fn(() => Promise.resolve({ error: null }))
    const delEq1 = vi.fn(() => ({ eq: delEq2 }))
    const del = vi.fn(() => ({ eq: delEq1 }))
    const from = vi.fn(() => ({ select, update, insert, delete: del }))
    return { order, eq, select, update, updateEq, insert, del, delEq1, delEq2, from }
  })

vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { listTasks, updateTask, addTaskTag, removeTaskTag } from './tasksRepo'

beforeEach(() => vi.clearAllMocks())

describe('tasksRepo', () => {
  it('lists tasks with embedded tags, ordered by position', async () => {
    order.mockResolvedValueOnce({
      data: [{ id: 't1', ref: 'NIM-101', task_tags: [{ tag: 'Backend' }, { tag: 'API' }] }],
      error: null,
    })
    const tasks = await listTasks('ws-1')
    expect(from).toHaveBeenCalledWith('tasks')
    expect(_select).toHaveBeenCalledWith('*, task_tags(tag)')
    expect(eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(order).toHaveBeenCalledWith('position', { ascending: true })
    expect(tasks[0].tags).toEqual(['Backend', 'API'])
    expect((tasks[0] as { task_tags?: unknown }).task_tags).toBeUndefined()
  })

  it('defaults tags to [] when none are embedded', async () => {
    order.mockResolvedValueOnce({ data: [{ id: 't2', ref: 'NIM-102' }], error: null })
    const tasks = await listTasks('ws-1')
    expect(tasks[0].tags).toEqual([])
  })

  it('throws on a Supabase error', async () => {
    order.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(listTasks('ws-1')).rejects.toThrow('boom')
  })

  it('updates a task with widened fields, scoped by id', async () => {
    await updateTask('t1', { description: 'd', type: 'bug', points: 3, start_date: '2026-07-01', end_date: '2026-07-09' })
    expect(update).toHaveBeenCalledWith({ description: 'd', type: 'bug', points: 3, start_date: '2026-07-01', end_date: '2026-07-09' })
    expect(updateEq).toHaveBeenCalledWith('id', 't1')
  })

  it('adds a tag', async () => {
    await addTaskTag('t1', 'Frontend')
    expect(from).toHaveBeenCalledWith('task_tags')
    expect(insert).toHaveBeenCalledWith({ task_id: 't1', tag: 'Frontend' })
  })

  it('removes a tag scoped by task_id + tag', async () => {
    await removeTaskTag('t1', 'Frontend')
    expect(del).toHaveBeenCalled()
    expect(delEq1).toHaveBeenCalledWith('task_id', 't1')
    expect(delEq2).toHaveBeenCalledWith('tag', 'Frontend')
  })
})
