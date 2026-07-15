import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  select: _select,
  update,
  updateEq,
  insert,
  del,
  delEq1,
  delEq2,
  from,
  rpc,
} = vi.hoisted(() => {
  const range = vi.fn(() =>
    Promise.resolve<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>({
      data: [],
      error: null,
    }),
  )
  const order2 = vi.fn(() => ({ range }))
  const order1 = vi.fn(() => ({ order: order2 }))
  const eq = vi.fn(() => ({ order: order1 }))
  const select = vi.fn(() => ({ eq }))
  const updateEq = vi.fn(() => Promise.resolve({ error: null }))
  const update = vi.fn(() => ({ eq: updateEq }))
  const insert = vi.fn(() => Promise.resolve({ error: null }))
  const delEq2 = vi.fn(() => Promise.resolve({ error: null }))
  const delEq1 = vi.fn(() => Object.assign(Promise.resolve({ error: null }), { eq: delEq2 }))
  const del = vi.fn(() => ({ eq: delEq1 }))
  const from = vi.fn(() => ({ select, update, insert, delete: del }))
  const rpc = vi.fn(() =>
    Promise.resolve<{ data: unknown; error: { message: string } | null }>({
      data: null,
      error: null,
    }),
  )
  return {
    range,
    order2,
    order1,
    eq,
    select,
    update,
    updateEq,
    insert,
    del,
    delEq1,
    delEq2,
    from,
    rpc,
  }
})

vi.mock('../lib/supabase', () => ({ supabase: { from, rpc } }))

import {
  queryTasks,
  updateTask,
  addTaskTag,
  removeTaskTag,
  createTask,
  deleteTask,
  moveTask,
  TaskMoveConflict,
  preflightBulkTaskAction,
  applyBulkTaskAction,
  undoBulkTaskAction,
} from './tasksRepo'

beforeEach(() => vi.clearAllMocks())

describe('tasksRepo', () => {
  it('queries a bounded cursor page and strips the server sort value', async () => {
    const abortSignal = vi.fn().mockResolvedValue({
      data: [
        { id: 't1', title: 'One', tags: ['Backend'], sort_value: '0001' },
        { id: 't2', title: 'Two', tags: null, sort_value: '0002' },
      ],
      error: null,
    })
    rpc.mockReturnValueOnce({ abortSignal } as never)

    const page = await queryTasks({ workspaceId: 'ws-1', assignee: [''], limit: 1 })

    expect(rpc).toHaveBeenCalledWith(
      'query_tasks',
      expect.objectContaining({
        p_workspace_id: 'ws-1',
        p_assignee: [],
        p_include_unassigned: true,
        p_limit: 1,
        p_sort: 'position',
      }),
    )
    expect(page.items).toEqual([{ id: 't1', title: 'One', tags: ['Backend'], blocked_by_count: 0 }])
    expect(page.nextCursor).toEqual({ sort: '0001', id: 't1' })
  })

  it('updates a task with widened fields, scoped by id', async () => {
    await updateTask('t1', {
      description: 'd',
      type: 'bug',
      points: 3,
      start_date: '2026-07-01',
      end_date: '2026-07-09',
    })
    expect(update).toHaveBeenCalledWith({
      description: 'd',
      type: 'bug',
      points: 3,
      start_date: '2026-07-01',
      end_date: '2026-07-09',
    })
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
      id: 't9',
      ref: 'NIM-110',
      title: 'New thing',
      workspace_id: 'ws-1',
      project_id: 'p1',
      created_by: 'u1',
      status: 'backlog',
      priority: 'medium',
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

  describe('moveTask', () => {
    it('moves through the atomic neighbour RPC', async () => {
      rpc.mockResolvedValueOnce({ data: { id: 't1', status: 'done' }, error: null })
      await moveTask('t1', 'done', 'before', 'after')
      expect(rpc).toHaveBeenCalledWith('move_task', {
        p_task_id: 't1',
        p_to_status: 'done',
        p_before_task_id: 'before',
        p_after_task_id: 'after',
      })
    })

    it('maps serialization failures to a retryable conflict', async () => {
      rpc.mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'stale' } } as any)
      await expect(moveTask('t1', 'done', null, null)).rejects.toBeInstanceOf(TaskMoveConflict)
    })
  })

  describe('bulk task operations', () => {
    it('maps preflight counts from the permission-aware RPC', async () => {
      rpc.mockResolvedValueOnce({
        data: [
          {
            requested_count: 3,
            will_change_count: 2,
            unchanged_count: 1,
            skipped_count: 0,
          },
        ],
        error: null,
      })

      await expect(
        preflightBulkTaskAction('w1', ['t1', 't2', 't3'], {
          kind: 'priority',
          value: 'high',
        }),
      ).resolves.toEqual({
        requestedCount: 3,
        willChangeCount: 2,
        unchangedCount: 1,
        skippedCount: 0,
      })
      expect(rpc).toHaveBeenCalledWith('preflight_bulk_task_action', {
        p_workspace_id: 'w1',
        p_task_ids: ['t1', 't2', 't3'],
        p_action: { kind: 'priority', value: 'high' },
      })
    })

    it('applies one atomic batch and preserves its undo deadline', async () => {
      rpc.mockResolvedValueOnce({
        data: [
          {
            operation_id: 'op1',
            requested_count: 2,
            changed_count: 2,
            unchanged_count: 0,
            skipped_count: 0,
            undoable_until: '2026-07-14T12:05:00Z',
          },
        ],
        error: null,
      })

      await expect(
        applyBulkTaskAction('op1', 'w1', ['t1', 't2'], { kind: 'archive' }),
      ).resolves.toEqual({
        operationId: 'op1',
        requestedCount: 2,
        changedCount: 2,
        unchangedCount: 0,
        skippedCount: 0,
        undoableUntil: '2026-07-14T12:05:00Z',
      })
    })

    it('maps conflict-safe undo counts', async () => {
      rpc.mockResolvedValueOnce({
        data: [{ restored_count: 1, conflict_count: 1, missing_count: 0 }],
        error: null,
      })

      await expect(undoBulkTaskAction('op1')).resolves.toEqual({
        restoredCount: 1,
        conflictCount: 1,
        missingCount: 0,
      })
    })
  })
})
