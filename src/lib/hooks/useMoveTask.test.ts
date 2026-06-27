import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { updateTask, logMove } = vi.hoisted(() => ({ updateTask: vi.fn(), logMove: vi.fn() }))
vi.mock('../../data/tasksRepo', () => ({ updateTask }))
vi.mock('../../data/activityRepo', () => ({ logMove }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('./useSession', () => ({ useSession: () => ({ session: { user: { id: 'u1' } } }) }))

import { useMoveTask } from './useMoveTask'
import { toast } from 'sonner'

const ws = 'w1'
const wrap = (qc: QueryClient) => ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: qc }, children)

beforeEach(() => vi.clearAllMocks())

describe('useMoveTask', () => {
  it('optimistically sets status+position and logs activity on a status change', async () => {
    const qc = new QueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    qc.setQueryData(['tasks', ws], [{ id: 't1', status: 'todo', position: 0 }])
    updateTask.mockResolvedValueOnce(undefined); logMove.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useMoveTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ taskId: 't1', toStatus: 'done', position: 5, fromStatus: 'todo' })
    await waitFor(() => {
      const t = (qc.getQueryData(['tasks', ws]) as any)[0]
      expect(t.status).toBe('done'); expect(t.position).toBe(5)
    })
    await waitFor(() => expect(logMove).toHaveBeenCalledWith(
      { workspaceId: ws, actorId: 'u1', taskId: 't1', fromStatus: 'todo', toStatus: 'done' }))
    // onSettled invalidates BOTH the tasks and activity caches
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['activity', ws] }))
  })

  it('does NOT log activity for a pure reorder (same status)', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', ws], [{ id: 't1', status: 'todo', position: 0 }])
    updateTask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useMoveTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ taskId: 't1', toStatus: 'todo', position: 2, fromStatus: 'todo' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(logMove).not.toHaveBeenCalled()
  })

  it('rolls back and toasts on error', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', ws], [{ id: 't1', status: 'todo', position: 0 }])
    updateTask.mockRejectedValueOnce(new Error('nope'))
    const { result } = renderHook(() => useMoveTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ taskId: 't1', toStatus: 'done', position: 5, fromStatus: 'todo' })
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect((qc.getQueryData(['tasks', ws]) as any)[0].status).toBe('todo')
  })

  it('keeps the move when logMove rejects — toasts "wasn\'t logged" but does NOT roll back', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', ws], [{ id: 't1', status: 'todo', position: 0 }])
    updateTask.mockResolvedValueOnce(undefined)
    logMove.mockRejectedValueOnce(new Error('activity db down'))
    const { result } = renderHook(() => useMoveTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ taskId: 't1', toStatus: 'done', position: 5, fromStatus: 'todo' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // The move should have persisted — cache stays at toStatus, NOT rolled back
    const cached = (qc.getQueryData(['tasks', ws]) as any)[0]
    expect(cached.status).toBe('done')
    expect(cached.position).toBe(5)
    // And we surfaced the failure via a toast mentioning "wasn't logged"
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("wasn't logged"))
  })
})
