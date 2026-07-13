import { beforeEach, describe, expect, it, vi } from 'vitest'

const { response, select, eq, or, order1, order2, limit, from } = vi.hoisted(() => {
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
  return { response, select, eq, or, order1, order2, limit, abortSignal, from }
})

vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { listActivityPage } from './activityRepo'

const ROW = {
  id: 'a1',
  verb: 'moved',
  from_status: 'todo',
  to_status: 'done',
  created_at: '2026-06-27T10:00:00Z',
  actor: { name: 'Dana', color: '#abc' },
  task: { ref: 'NIM-101', title: 'Fix login' },
}

beforeEach(() => {
  vi.clearAllMocks()
  response.current = { data: [], error: null }
})

describe('activityRepo.listActivityPage', () => {
  it('reads a bounded newest-first page with stable id ordering', async () => {
    response.current = { data: [ROW], error: null }
    const page = await listActivityPage('w1')
    expect(from).toHaveBeenCalledWith('activity')
    expect(select).toHaveBeenCalledWith(expect.stringContaining('actor:profiles!actor_id'))
    expect(eq).toHaveBeenCalledWith('workspace_id', 'w1')
    expect(order1).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(order2).toHaveBeenCalledWith('id', { ascending: false })
    expect(limit).toHaveBeenCalledWith(51)
    expect(page.items[0]).toEqual(ROW)
    expect(page.nextCursor).toBeNull()
  })

  it('applies the compound cursor and uses immutable task snapshots', async () => {
    response.current = {
      data: [{ ...ROW, task: null, task_ref_snapshot: 'NIM-101', task_title_snapshot: 'Gone' }],
      error: null,
    }
    const page = await listActivityPage('w1', { createdAt: '2026-07-01T00:00:00Z', id: 'a9' })
    expect(or).toHaveBeenCalledWith(expect.stringContaining('id.lt.a9'))
    expect(page.items[0].task).toEqual({ ref: 'NIM-101', title: 'Gone' })
  })

  it('throws on a Supabase error', async () => {
    response.current = { data: [], error: { message: 'boom' } }
    await expect(listActivityPage('w1')).rejects.toThrow('boom')
  })
})
