import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { createTask } = vi.hoisted(() => ({ createTask: vi.fn() }))
vi.mock('../../data/tasksRepo', () => ({ createTask }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { useCreateTask } from './useCreateTask'
import { toast } from 'sonner'

const ws = 'w1'
const project = { id: 'p1', name: 'Nimbus', key: 'NIM' }
const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)

beforeEach(() => vi.clearAllMocks())

describe('useCreateTask', () => {
  it('creates through the server RPC and invalidates task and activity caches', async () => {
    const qc = new QueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    createTask.mockResolvedValueOnce({ id: 't9', ref: 'NIM-107', tags: [] })
    const { result } = renderHook(() => useCreateTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ title: 'New thing', project })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(createTask).toHaveBeenCalledWith({ projectId: 'p1', title: 'New thing' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', ws] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['activity', ws] })
  })

  it('seeds the tasks cache with the created task so the drawer can open it immediately', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', ws], [{ id: 't1', ref: 'NIM-101', tags: [] }])
    createTask.mockResolvedValueOnce({ id: 't9', ref: 'NIM-107', tags: [] })
    const { result } = renderHook(() => useCreateTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ title: 'New thing', project })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(qc.getQueryData(['tasks', ws])).toEqual([
      { id: 't1', ref: 'NIM-101', tags: [] },
      { id: 't9', ref: 'NIM-107', tags: [] },
    ])
  })

  it('toasts on create failure', async () => {
    const qc = new QueryClient()
    createTask.mockRejectedValueOnce(new Error('nope'))
    const { result } = renderHook(() => useCreateTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ title: 'New thing', project })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('nope'))
  })
})
