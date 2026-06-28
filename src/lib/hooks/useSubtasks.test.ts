import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { listSubtasks, addSubtask, toggleSubtask, deleteSubtask } = vi.hoisted(() => ({
  listSubtasks: vi.fn(), addSubtask: vi.fn(), toggleSubtask: vi.fn(), deleteSubtask: vi.fn(),
}))
vi.mock('../../data/subtasksRepo', () => ({ listSubtasks, addSubtask, toggleSubtask, deleteSubtask }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { useSubtasks } from './useSubtasks'

const wrap = (qc: QueryClient) => ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: qc }, children)

beforeEach(() => vi.clearAllMocks())

describe('useSubtasks', () => {
  it('adds with position computed from the cached count', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['subtasks', 't1'], [{ id: 's1' }, { id: 's2' }])
    addSubtask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useSubtasks('t1'), { wrapper: wrap(qc) })
    result.current.add.mutate('New one')
    await waitFor(() => expect(addSubtask).toHaveBeenCalledWith('t1', 'New one', 2))
  })

  it('optimistically toggles done', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['subtasks', 't1'], [{ id: 's1', done: false }])
    toggleSubtask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useSubtasks('t1'), { wrapper: wrap(qc) })
    result.current.toggle.mutate({ id: 's1', done: true })
    await waitFor(() => expect((qc.getQueryData(['subtasks', 't1']) as any)[0].done).toBe(true))
  })
})
