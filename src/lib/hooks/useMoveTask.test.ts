import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { moveTask } = vi.hoisted(() => ({ moveTask: vi.fn() }))
vi.mock('../../data/tasksRepo', () => ({
  moveTask,
  TaskMoveConflict: class TaskMoveConflict extends Error {},
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { TaskMoveConflict } from '../../data/tasksRepo'
import { refreshedMoveNeighbours, useMoveTask } from './useMoveTask'
import { toast } from 'sonner'

const ws = 'w1'
const moveArgs = {
  taskId: 't1',
  toStatus: 'done' as const,
  position: 5,
  fromStatus: 'todo' as const,
  beforeTaskId: null,
  afterTaskId: null,
}
const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)

beforeEach(() => vi.clearAllMocks())

describe('useMoveTask', () => {
  it('optimistically sets status+position and refreshes server activity', async () => {
    const qc = new QueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    qc.setQueryData(['tasks', ws], [{ id: 't1', status: 'todo', position: 0 }])
    moveTask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useMoveTask(ws), { wrapper: wrap(qc) })
    result.current.mutate(moveArgs)
    await waitFor(() => {
      const t = (qc.getQueryData(['tasks', ws]) as any)[0]
      expect(t.status).toBe('done')
      expect(t.position).toBe(5)
    })
    // onSettled invalidates BOTH the tasks and activity caches
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['activity', ws] }))
  })

  it('persists a pure reorder through the same task update', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', ws], [{ id: 't1', status: 'todo', position: 0 }])
    moveTask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useMoveTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({
      ...moveArgs,
      toStatus: 'todo',
      position: 2,
      beforeTaskId: 'a',
      afterTaskId: 'b',
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(moveTask).toHaveBeenCalledWith('t1', 'todo', 'a', 'b')
  })

  it('derives a complete-column anchor for status selectors that omit neighbours', async () => {
    const qc = new QueryClient()
    qc.setQueryData(
      ['tasks', ws],
      [
        { id: 't1', status: 'backlog', position: 0 },
        { id: 'first', status: 'done', position: 10 },
        { id: 'second', status: 'done', position: 20 },
      ],
    )
    moveTask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useMoveTask(ws), { wrapper: wrap(qc) })

    result.current.mutate({
      taskId: 't1',
      toStatus: 'done',
      position: 0,
      fromStatus: 'backlog',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(moveTask).toHaveBeenCalledWith('t1', 'done', null, 'first')
  })

  it('rolls back and toasts on error', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', ws], [{ id: 't1', status: 'todo', position: 0 }])
    moveTask.mockRejectedValueOnce(new Error('nope'))
    const { result } = renderHook(() => useMoveTask(ws), { wrapper: wrap(qc) })
    result.current.mutate(moveArgs)
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect((qc.getQueryData(['tasks', ws]) as any)[0].status).toBe('todo')
  })

  it('invalidates and retries once with complete-column neighbours after a stale conflict', async () => {
    const qc = new QueryClient()
    qc.setQueryData(
      ['tasks', ws],
      [
        { id: 't1', status: 'backlog', position: 0 },
        { id: 'before', status: 'done', position: 10 },
        { id: 'hidden', status: 'done', position: 20 },
        { id: 'after', status: 'done', position: 30 },
      ],
    )
    moveTask.mockRejectedValueOnce(new TaskMoveConflict()).mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useMoveTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({
      ...moveArgs,
      beforeTaskId: 'before',
      afterTaskId: 'after',
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(moveTask).toHaveBeenNthCalledWith(1, 't1', 'done', 'before', 'after')
    expect(moveTask).toHaveBeenNthCalledWith(2, 't1', 'done', 'before', 'hidden')
  })
})

describe('refreshedMoveNeighbours', () => {
  it('anchors after the submitted before task in the complete column', () => {
    const tasks = [
      { id: 'a', status: 'todo', position: 10 },
      { id: 'hidden', status: 'todo', position: 20 },
      { id: 'b', status: 'todo', position: 30 },
    ] as any[]
    expect(
      refreshedMoveNeighbours(tasks, {
        ...moveArgs,
        toStatus: 'todo',
        beforeTaskId: 'a',
        afterTaskId: 'b',
      }),
    ).toEqual({ beforeTaskId: 'a', afterTaskId: 'hidden' })
  })
})
