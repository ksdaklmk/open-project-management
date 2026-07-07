import { describe, it, expect, vi, beforeEach } from 'vitest'

const { order, eq, select: _select, update, updateEq, insert, insertSingle, del, delEq1, delEq2, from } =
  vi.hoisted(() => {
    const order = vi.fn()
    const eq = vi.fn(() =>
      Object.assign(
        Promise.resolve<{ data: { ref: string }[]; error: null }>({ data: [], error: null }),
        { order },
      ))
    const select = vi.fn(() => ({ eq }))
    const updateEq = vi.fn(() => Promise.resolve({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))
    const insertSingle = vi.fn(() =>
      Promise.resolve<{ data: Record<string, unknown> | null; error: { message: string; code?: string } | null }>(
        { data: null, error: null }))
    const insertSelect = vi.fn(() => ({ single: insertSingle }))
    const insert = vi.fn(() =>
      Object.assign(Promise.resolve({ error: null }), { select: insertSelect }))
    const delEq2 = vi.fn(() => Promise.resolve({ error: null }))
    const delEq1 = vi.fn(() =>
      Object.assign(Promise.resolve({ error: null }), { eq: delEq2 }))
    const del = vi.fn(() => ({ eq: delEq1 }))
    const from = vi.fn(() => ({ select, update, insert, delete: del }))
    return { order, eq, select, update, updateEq, insert, insertSelect, insertSingle, del, delEq1, delEq2, from }
  })

vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { listTasks, updateTask, addTaskTag, removeTaskTag, nextRef, createTask } from './tasksRepo'

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

  describe('nextRef', () => {
    it.each([
      [[], 'NIM', 'NIM-101'],                                   // empty project → seed convention
      [['NIM-101', 'NIM-104'], 'NIM', 'NIM-105'],               // gaps: max + 1, not count
      [['NIM-101', 'NIM-abc', 'OTHER-900'], 'NIM', 'NIM-102'],  // non-numeric + other keys ignored
      [['NIM-9'], 'NIM', 'NIM-101'],                            // below the floor → still 101
    ])('%j + %s → %s', (refs, key, expected) => {
      expect(nextRef(refs as string[], key as string)).toBe(expected)
    })
  })

  const CREATE_INPUT = {
    workspaceId: 'ws-1', projectId: 'p1', projectKey: 'NIM',
    title: 'New thing', createdBy: 'u1',
  }
  const ROW = {
    id: 't9', ref: 'NIM-103', title: 'New thing', workspace_id: 'ws-1',
    project_id: 'p1', created_by: 'u1', status: 'backlog', priority: 'medium',
  }

  it('creates a task with the next ref and returns it with empty tags', async () => {
    eq.mockImplementationOnce(() =>
      Object.assign(Promise.resolve({ data: [{ ref: 'NIM-101' }, { ref: 'NIM-102' }], error: null }), { order }))
    insertSingle.mockResolvedValueOnce({ data: ROW, error: null })
    const task = await createTask(CREATE_INPUT)
    expect(_select).toHaveBeenCalledWith('ref')
    expect(eq).toHaveBeenCalledWith('project_id', 'p1')
    expect(insert).toHaveBeenCalledWith({
      workspace_id: 'ws-1', project_id: 'p1', ref: 'NIM-103',
      title: 'New thing', created_by: 'u1',
    })
    expect(task.tags).toEqual([])
    expect(task.ref).toBe('NIM-103')
  })

  it('retries exactly once on a 23505 ref race, with a recomputed ref', async () => {
    eq.mockImplementationOnce(() =>
        Object.assign(Promise.resolve({ data: [{ ref: 'NIM-102' }], error: null }), { order }))
      .mockImplementationOnce(() =>
        Object.assign(Promise.resolve({ data: [{ ref: 'NIM-102' }, { ref: 'NIM-103' }], error: null }), { order }))
    insertSingle
      .mockResolvedValueOnce({ data: null, error: { message: 'duplicate key', code: '23505' } })
      .mockResolvedValueOnce({ data: { ...ROW, ref: 'NIM-104' }, error: null })
    const task = await createTask(CREATE_INPUT)
    expect(insert).toHaveBeenCalledTimes(2)
    expect(insert).toHaveBeenNthCalledWith(1, expect.objectContaining({ ref: 'NIM-103' }))
    expect(insert).toHaveBeenNthCalledWith(2, expect.objectContaining({ ref: 'NIM-104' }))
    expect(task.ref).toBe('NIM-104')
  })

  it('does NOT retry non-23505 insert errors', async () => {
    insertSingle.mockResolvedValueOnce({ data: null, error: { message: 'permission denied', code: '42501' } })
    await expect(createTask(CREATE_INPUT)).rejects.toThrow('permission denied')
    expect(insert).toHaveBeenCalledTimes(1)
  })
})
