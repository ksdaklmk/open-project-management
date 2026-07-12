import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { updateTask } = vi.hoisted(() => ({ updateTask: vi.fn() }))
vi.mock('../../data/tasksRepo', () => ({ updateTask }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { useMoveTask } from './useMoveTask'
import { toast } from 'sonner'

const ws = 'w1'
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
    updateTask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useMoveTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ taskId: 't1', toStatus: 'done', position: 5, fromStatus: 'todo' })
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
    updateTask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useMoveTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ taskId: 't1', toStatus: 'todo', position: 2, fromStatus: 'todo' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(updateTask).toHaveBeenCalledWith('t1', { status: 'todo', position: 2 })
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
})
