import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'

const { listActivityPage } = vi.hoisted(() => ({ listActivityPage: vi.fn() }))
vi.mock('../../data/activityRepo', () => ({ listActivityPage }))
import { useActivity } from './useActivity'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)

it('retains and flattens loaded activity history', async () => {
  listActivityPage
    .mockResolvedValueOnce({ items: [{ id: 'new' }], nextCursor: { createdAt: 'b', id: 'new' } })
    .mockResolvedValueOnce({ items: [{ id: 'old' }], nextCursor: null })
  const { result } = renderHook(() => useActivity('w1'), { wrapper })
  await waitFor(() => expect(result.current.data).toEqual([{ id: 'new' }]))
  await act(() => result.current.fetchNextPage())
  await waitFor(() => expect(result.current.data).toEqual([{ id: 'new' }, { id: 'old' }]))
})
