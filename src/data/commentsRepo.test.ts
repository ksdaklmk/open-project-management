import { beforeEach, describe, expect, it, vi } from 'vitest'

const { response, select, eq, or, order1, order2, limit, from, rpc } = vi.hoisted(() => {
  const response = {
    current: { data: [] as Record<string, unknown>[], error: null as null | { message: string } },
  }
  const abortSignal = vi.fn(() => Promise.resolve(response.current))
  const limit = vi.fn(() => ({ abortSignal }))
  const order2 = vi.fn(() => ({ limit }))
  const order1 = vi.fn(() => ({ order: order2 }))
  const or = vi.fn(() => ({ order: order1 }))
  const eq = vi.fn(() => ({ order: order1, or }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  const rpc = vi.fn(() => Promise.resolve({ error: null }))
  return { response, select, eq, or, order1, order2, limit, abortSignal, from, rpc }
})

vi.mock('../lib/supabase', () => ({ supabase: { from, rpc } }))

import { addComment, listCommentsPage } from './commentsRepo'

beforeEach(() => {
  vi.clearAllMocks()
  response.current = { data: [], error: null }
})

describe('commentsRepo', () => {
  it('returns a bounded newest-first page with author names', async () => {
    response.current = {
      data: [
        { id: 'c2', body: 'newer', created_at: '2026-06-29T00:00:00Z', author: null },
        { id: 'c1', body: 'older', created_at: '2026-06-28T00:00:00Z', author: { name: 'Dana' } },
      ],
      error: null,
    }
    const page = await listCommentsPage('t1')
    expect(select).toHaveBeenCalledWith('id, body, created_at, author:profiles!author_id(name)')
    expect(eq).toHaveBeenCalledWith('task_id', 't1')
    expect(order1).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(order2).toHaveBeenCalledWith('id', { ascending: false })
    expect(limit).toHaveBeenCalledWith(51)
    expect(page.items.map((row) => row.id)).toEqual(['c2', 'c1'])
    expect(page.items[1].author).toEqual({ name: 'Dana' })
  })

  it('uses a stable compound cursor', async () => {
    await listCommentsPage('t1', { createdAt: '2026-07-01T00:00:00Z', id: 'c9' })
    expect(or).toHaveBeenCalledWith(expect.stringContaining('id.lt.c9'))
  })

  it('adds a comment and normalized mentions through the identity-pinned RPC', async () => {
    await addComment('t1', 'nice', ['u2'])
    expect(rpc).toHaveBeenCalledWith('create_comment', {
      p_task_id: 't1',
      p_body: 'nice',
      p_mentioned_user_ids: ['u2'],
    })
  })
})
