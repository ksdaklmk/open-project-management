import { describe, it, expect, vi, beforeEach } from 'vitest'

const { limit, order, eq, select, insert, from } = vi.hoisted(() => {
  const limit = vi.fn()
  const order = vi.fn(() => ({ limit }))
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const insert = vi.fn(() => Promise.resolve({ error: null }))
  const from = vi.fn(() => ({ select, insert }))
  return { limit, order, eq, select, insert, from }
})
vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { listComments, addComment } from './commentsRepo'

beforeEach(() => vi.clearAllMocks())

describe('commentsRepo', () => {
  it('lists comments with the author name embedded', async () => {
    limit.mockResolvedValueOnce({
      data: [{ id: 'c1', body: 'hi', created_at: '2026-06-28T00:00:00Z', author: { name: 'Dana Lee' } }],
      error: null,
    })
    const rows = await listComments('t1')
    expect(from).toHaveBeenCalledWith('comments')
    expect(select).toHaveBeenCalledWith('id, body, created_at, author:profiles!author_id(name)')
    expect(eq).toHaveBeenCalledWith('task_id', 't1')
    expect(rows[0]).toEqual({ id: 'c1', body: 'hi', created_at: '2026-06-28T00:00:00Z', author: { name: 'Dana Lee' } })
  })
  it('keeps the NEWEST 100 (fetches descending) and returns them oldest-first', async () => {
    limit.mockResolvedValueOnce({
      data: [
        { id: 'c2', body: 'newer', created_at: '2026-06-29T00:00:00Z', author: null },
        { id: 'c1', body: 'older', created_at: '2026-06-28T00:00:00Z', author: null },
      ],
      error: null,
    })
    const rows = await listComments('t1')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(limit).toHaveBeenCalledWith(100)
    expect(rows.map((r) => r.id)).toEqual(['c1', 'c2'])
  })
  it('coalesces a missing author to null', async () => {
    limit.mockResolvedValueOnce({ data: [{ id: 'c2', body: 'x', created_at: 'z', author: null }], error: null })
    const rows = await listComments('t1')
    expect(rows[0].author).toBeNull()
  })
  it('adds a comment with a pinned author_id', async () => {
    await addComment('t1', 'nice', 'user-9')
    expect(insert).toHaveBeenCalledWith({ task_id: 't1', body: 'nice', author_id: 'user-9' })
  })
})
