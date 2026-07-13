import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'

const { queryMyWork } = vi.hoisted(() => ({ queryMyWork: vi.fn() }))
vi.mock('../../data/myWorkRepo', () => ({ queryMyWork }))
import { useMyWork } from './useMyWork'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)

it('flattens bounded personal-work pages', async () => {
  queryMyWork
    .mockResolvedValueOnce({ items: [{ id: 't1' }], nextCursor: { sort: 'a', id: 't1' } })
    .mockResolvedValueOnce({ items: [{ id: 't2' }], nextCursor: null })
  const { result } = renderHook(() => useMyWork('assigned'), { wrapper })
  await waitFor(() => expect(result.current.data).toEqual([{ id: 't1' }]))
  await act(() => result.current.fetchNextPage())
  await waitFor(() => expect(result.current.data).toEqual([{ id: 't1' }, { id: 't2' }]))
})
