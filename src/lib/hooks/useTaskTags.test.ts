import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { addTaskTag, removeTaskTag } = vi.hoisted(() => ({
  addTaskTag: vi.fn(),
  removeTaskTag: vi.fn(),
}))
vi.mock('../../data/tasksRepo', () => ({ addTaskTag, removeTaskTag }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { useTaskTags } from './useTaskTags'

const ws = 'w1'
const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)

beforeEach(() => vi.clearAllMocks())

describe('useTaskTags', () => {
  it('optimistically appends a tag', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', ws], [{ id: 't1', tags: ['API'] }])
    addTaskTag.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useTaskTags(ws), { wrapper: wrap(qc) })
    result.current.add.mutate({ id: 't1', tag: 'Backend' })
    await waitFor(() =>
      expect((qc.getQueryData(['tasks', ws]) as any)[0].tags).toEqual(['API', 'Backend']),
    )
  })

  it('optimistically removes a tag and rolls back on error', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', ws], [{ id: 't1', tags: ['API', 'Backend'] }])
    removeTaskTag.mockRejectedValueOnce(new Error('no'))
    const { result } = renderHook(() => useTaskTags(ws), { wrapper: wrap(qc) })
    result.current.remove.mutate({ id: 't1', tag: 'API' })
    await waitFor(() =>
      expect((qc.getQueryData(['tasks', ws]) as any)[0].tags).toEqual(['API', 'Backend']),
    )
  })
})
