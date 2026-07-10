import { describe, it, expect, vi, beforeEach } from 'vitest'

const { range, order2, order1, eq, select: _select, update, updateEq, insert, del, delEq1, delEq2, from, rpc } =
  vi.hoisted(() => {
    const range = vi.fn(() =>
      Promise.resolve<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>(
        { data: [], error: null }))
    const order2 = vi.fn(() => ({ range }))
    const order1 = vi.fn(() => ({ order: order2 }))
    const eq = vi.fn(() => ({ order: order1 }))
    const select = vi.fn(() => ({ eq }))
    const updateEq = vi.fn(() => Promise.resolve({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))
    const insert = vi.fn(() => Promise.resolve({ error: null }))
    const delEq2 = vi.fn(() => Promise.resolve({ error: null }))
    const delEq1 = vi.fn(() =>
      Object.assign(Promise.resolve({ error: null }), { eq: delEq2 }))
    const del = vi.fn(() => ({ eq: delEq1 }))
    const from = vi.fn(() => ({ select, update, insert, delete: del }))
    const rpc = vi.fn(() =>
      Promise.resolve<{ data: Record<string, unknown> | null; error: { message: string } | null }>(
        { data: null, error: null }))
    return { range, order2, order1, eq, select, update, updateEq, insert, del, delEq1, delEq2, from, rpc }
  })

vi.mock('../lib/supabase', () => ({ supabase: { from, rpc } }))

import { listTasks, updateTask, addTaskTag, removeTaskTag, createTask, deleteTask } from './tasksRepo'

beforeEach(() => vi.clearAllMocks())

describe('tasksRepo', () => {
  it('lists tasks with embedded tags, ordered by position with an id tiebreak', async () => {
    range.mockResolvedValueOnce({
      data: [{ id: 't1', ref: 'NIM-101', task_tags: [{ tag: 'Backend' }, { tag: 'API' }] }],
      error: null,
    })
    const tasks = await listTasks('ws-1')
    expect(from).toHaveBeenCalledWith('tasks')
    expect(_select).toHaveBeenCalledWith('*, task_tags(tag)')
    expect(eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(order1).toHaveBeenCalledWith('position', { ascending: true })
    expect(order2).toHaveBeenCalledWith('id', { ascending: true })
    expect(tasks[0].tags).toEqual(['Backend', 'API'])
    expect((tasks[0] as { task_tags?: unknown }).task_tags).toBeUndefined()
  })

  it('defaults tags to [] when none are embedded', async () => {
    range.mockResolvedValueOnce({ data: [{ id: 't2', ref: 'NIM-102' }], error: null })
    const tasks = await listTasks('ws-1')
    expect(tasks[0].tags).toEqual([])
  })

  it('throws on a Supabase error', async () => {
    range.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(listTasks('ws-1')).rejects.toThrow('boom')
  })

  it('stops after one page when the page is not full', async () => {
    range.mockResolvedValueOnce({ data: [{ id: 't1' }], error: null })
    await listTasks('ws-1')
    expect(range).toHaveBeenCalledTimes(1)
    expect(range).toHaveBeenCalledWith(0, 999)
  })

  it('keeps fetching pages while they come back full (the 1,000-row API cap)', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ id: `t${i}` }))
    range
      .mockResolvedValueOnce({ data: fullPage, error: null })
      .mockResolvedValueOnce({ data: [{ id: 't-last' }], error: null })
    const tasks = await listTasks('ws-1')
    expect(range).toHaveBeenNthCalledWith(1, 0, 999)
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999)
    expect(tasks).toHaveLength(1001)
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

  it('deletes a task scoped by id', async () => {
    await deleteTask('t1')
    expect(from).toHaveBeenCalledWith('tasks')
    expect(del).toHaveBeenCalled()
    expect(delEq1).toHaveBeenCalledWith('id', 't1')
  })

  describe('createTask', () => {
    const ROW = {
      id: 't9', ref: 'NIM-110', title: 'New thing', workspace_id: 'ws-1',
      project_id: 'p1', created_by: 'u1', status: 'backlog', priority: 'medium',
    }

    it('creates via the create_task RPC and returns the row with empty tags', async () => {
      rpc.mockResolvedValueOnce({ data: ROW, error: null })
      const task = await createTask({ projectId: 'p1', title: 'New thing' })
      expect(rpc).toHaveBeenCalledWith('create_task', { p_project_id: 'p1', p_title: 'New thing' })
      expect(task.ref).toBe('NIM-110')
      expect(task.tags).toEqual([])
    })

    it('throws on an RPC error', async () => {
      rpc.mockResolvedValueOnce({ data: null, error: { message: 'not a member' } })
      await expect(createTask({ projectId: 'p1', title: 'x' })).rejects.toThrow('not a member')
    })
  })
})
