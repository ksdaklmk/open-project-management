import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { updateTask } = vi.hoisted(() => ({ updateTask: vi.fn() }))
vi.mock('../../data/tasksRepo', () => ({ updateTask }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { useUpdateTask } from './useUpdateTask'
import { toast } from 'sonner'

const wsId = 'w1'
function wrap(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => vi.clearAllMocks())

describe('useUpdateTask', () => {
  it('optimistically patches the cached task', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', wsId], [{ id: 't1', status: 'todo' }])
    updateTask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useUpdateTask(wsId), { wrapper: wrap(qc) })
    result.current.mutate({ id: 't1', patch: { status: 'done' } })
    await waitFor(() =>
      expect((qc.getQueryData(['tasks', wsId]) as any)[0].status).toBe('done'))
  })

  it('rolls back and toasts on error', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', wsId], [{ id: 't1', status: 'todo' }])
    updateTask.mockRejectedValueOnce(new Error('nope'))
    const { result } = renderHook(() => useUpdateTask(wsId), { wrapper: wrap(qc) })
    result.current.mutate({ id: 't1', patch: { status: 'done' } })
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect((qc.getQueryData(['tasks', wsId]) as any)[0].status).toBe('todo')
  })
})
