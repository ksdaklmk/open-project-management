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
  it('adds with a position above the current max, not the count (a deleted row must not be reused)', async () => {
    const qc = new QueryClient()
    // s2 (position 1) was deleted: count is 2, but position 2 is still live on s3.
    const rows = [{ id: 's1', position: 0 }, { id: 's3', position: 2 }]
    qc.setQueryData(['subtasks', 't1'], rows)
    listSubtasks.mockResolvedValue(rows)
    addSubtask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useSubtasks('t1'), { wrapper: wrap(qc) })
    result.current.add.mutate('New one')
    await waitFor(() => expect(addSubtask).toHaveBeenCalledWith('t1', 'New one', 3))
  })

  it('starts positions at 0 for an empty list', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['subtasks', 't1'], [])
    listSubtasks.mockResolvedValue([])
    addSubtask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useSubtasks('t1'), { wrapper: wrap(qc) })
    result.current.add.mutate('First')
    await waitFor(() => expect(addSubtask).toHaveBeenCalledWith('t1', 'First', 0))
  })

  it('optimistically toggles done', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['subtasks', 't1'], [{ id: 's1', done: false }])
    listSubtasks.mockResolvedValue([{ id: 's1', done: true }])
    toggleSubtask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useSubtasks('t1'), { wrapper: wrap(qc) })
    result.current.toggle.mutate({ id: 's1', done: true })
    await waitFor(() => expect((qc.getQueryData(['subtasks', 't1']) as any)[0].done).toBe(true))
  })
})
