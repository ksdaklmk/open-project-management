import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { listComments, addComment } = vi.hoisted(() => ({ listComments: vi.fn(), addComment: vi.fn() }))
vi.mock('../../data/commentsRepo', () => ({ listComments, addComment }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('./useSession', () => ({ useSession: () => ({ session: { user: { id: 'me' } }, loading: false }) }))

import { useAddComment } from './useComments'

const wrap = (qc: QueryClient) => ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: qc }, children)

beforeEach(() => vi.clearAllMocks())

describe('useAddComment', () => {
  it('optimistically appends then calls the repo with the session uid', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['comments', 't1'], [{ id: 'c1', body: 'old', created_at: 'a', author: null }])
    addComment.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useAddComment('t1'), { wrapper: wrap(qc) })
    result.current.mutate('hello')
    await waitFor(() => {
      const rows = qc.getQueryData(['comments', 't1']) as any[]
      expect(rows[rows.length - 1].body).toBe('hello')
    })
    expect(addComment).toHaveBeenCalledWith('t1', 'hello', 'me')
  })
})
