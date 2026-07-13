import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { deleteTask } = vi.hoisted(() => ({ deleteTask: vi.fn() }))
vi.mock('../../data/tasksRepo', () => ({ deleteTask }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { useDeleteTask } from './useDeleteTask'
import { toast } from 'sonner'

const ws = 'w1'
const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)

beforeEach(() => vi.clearAllMocks())

describe('useDeleteTask', () => {
  it('deletes and invalidates tasks + activity', async () => {
    const qc = new QueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    deleteTask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useDeleteTask(ws), { wrapper: wrap(qc) })
    result.current.mutate('t1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(deleteTask).toHaveBeenCalledWith('t1')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', ws] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['activity', ws] })
  })

  it('toasts on failure', async () => {
    const qc = new QueryClient()
    deleteTask.mockRejectedValueOnce(new Error('nope'))
    const { result } = renderHook(() => useDeleteTask(ws), { wrapper: wrap(qc) })
    result.current.mutate('t1')
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('nope'))
  })
})
