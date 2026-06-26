import { describe, it, expect, vi, beforeEach } from 'vitest'

const { order, select: _select, from } = vi.hoisted(() => {
  const order = vi.fn()
  const select = vi.fn(() => ({ order }))
  const from = vi.fn(() => ({ select }))
  return { order, select, from }
})
vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { listMine } from './workspacesRepo'

beforeEach(() => vi.clearAllMocks())

describe('workspacesRepo.listMine', () => {
  it('selects all workspaces ordered by name', async () => {
    order.mockResolvedValueOnce({ data: [{ id: 'w1', name: 'Acme' }], error: null })
    const out = await listMine()
    expect(from).toHaveBeenCalledWith('workspaces')
    expect(order).toHaveBeenCalledWith('name')
    expect(out).toEqual([{ id: 'w1', name: 'Acme' }])
  })
  it('throws on error', async () => {
    order.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(listMine()).rejects.toThrow('boom')
  })
})
