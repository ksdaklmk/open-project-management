import { describe, it, expect, vi, beforeEach } from 'vitest'

const { order, eq, select, from } = vi.hoisted(() => {
  const order = vi.fn()
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { order, eq, select, from }
})

vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { listProjects } from './projectsRepo'

beforeEach(() => vi.clearAllMocks())

describe('projectsRepo', () => {
  it('lists id/name/key for a workspace, ordered by name', async () => {
    order.mockResolvedValueOnce({
      data: [{ id: 'p1', name: 'Nimbus', key: 'NIM' }],
      error: null,
    })
    const projects = await listProjects('ws-1')
    expect(from).toHaveBeenCalledWith('projects')
    expect(select).toHaveBeenCalledWith('id, name, key')
    expect(eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(order).toHaveBeenCalledWith('name')
    expect(projects).toEqual([{ id: 'p1', name: 'Nimbus', key: 'NIM' }])
  })

  it('defaults to [] and throws on error', async () => {
    order.mockResolvedValueOnce({ data: null, error: null })
    expect(await listProjects('ws-1')).toEqual([])
    order.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(listProjects('ws-1')).rejects.toThrow('boom')
  })
})
