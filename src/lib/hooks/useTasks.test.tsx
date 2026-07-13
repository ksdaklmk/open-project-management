import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { queryTasks, getTaskByRef, queryWorkload } = vi.hoisted(() => ({
  queryTasks: vi.fn(),
  getTaskByRef: vi.fn(),
  queryWorkload: vi.fn(),
}))
vi.mock('../../data/tasksRepo', () => ({ queryTasks, getTaskByRef, queryWorkload }))

import { useTask, useTasks, useWorkload } from './useTasks'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

beforeEach(() => vi.clearAllMocks())

describe('bounded task hooks', () => {
  it('flattens cursor pages and fetches the next page', async () => {
    queryTasks
      .mockResolvedValueOnce({ items: [{ id: 't1' }], nextCursor: { sort: '1', id: 't1' } })
      .mockResolvedValueOnce({ items: [{ id: 't2' }], nextCursor: null })
    const { result } = renderHook(() => useTasks('w1', { sort: 'position' }), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([{ id: 't1' }]))
    await act(() => result.current.fetchNextPage())
    await waitFor(() => expect(result.current.data).toEqual([{ id: 't1' }, { id: 't2' }]))
    expect(queryTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ workspaceId: 'w1', cursor: { sort: '1', id: 't1' } }),
      expect.any(AbortSignal),
    )
  })

  it('fetches one drawer task by stable ref', async () => {
    getTaskByRef.mockResolvedValueOnce({ id: 't1', ref: 'NIM-1' })
    const { result } = renderHook(() => useTask('w1', 'NIM-1'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ id: 't1', ref: 'NIM-1' }))
  })

  it('fetches server-aggregated Workload points', async () => {
    queryWorkload.mockResolvedValueOnce([{ bucket: 'scheduled', points: 5 }])
    const { result } = renderHook(() => useWorkload('w1', '2026-07-13'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([{ bucket: 'scheduled', points: 5 }]))
    expect(queryWorkload).toHaveBeenCalledWith('w1', '2026-07-13', 6, expect.any(AbortSignal))
  })
})
