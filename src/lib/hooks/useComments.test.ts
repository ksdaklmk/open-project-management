import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { listCommentsPage, addComment } = vi.hoisted(() => ({
  listCommentsPage: vi.fn(),
  addComment: vi.fn(),
}))
vi.mock('../../data/commentsRepo', () => ({ listCommentsPage, addComment }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { useAddComment } from './useComments'

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)

beforeEach(() => vi.clearAllMocks())

describe('useAddComment', () => {
  it('optimistically appends then calls the repo with the session uid', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['comments', 't1'], {
      pages: [
        { items: [{ id: 'c1', body: 'old', created_at: 'a', author: null }], nextCursor: null },
      ],
      pageParams: [null],
    })
    addComment.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useAddComment('t1', 'w1'), { wrapper: wrap(qc) })
    result.current.mutate('hello')
    await waitFor(() => {
      const cache = qc.getQueryData(['comments', 't1']) as any
      expect(cache.pages[0].items[0].body).toBe('hello')
    })
    expect(addComment).toHaveBeenCalledWith('t1', 'hello', [])
  })

  it('invalidates server-authored activity after the comment saves', async () => {
    const qc = new QueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    addComment.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useAddComment('t1', 'w1'), { wrapper: wrap(qc) })
    result.current.mutate('hello')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['activity', 'w1'] })
  })
})
