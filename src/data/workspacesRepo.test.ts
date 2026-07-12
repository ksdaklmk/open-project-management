import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  order,
  select: _select,
  from,
  rpc,
} = vi.hoisted(() => {
  const order = vi.fn()
  const select = vi.fn(() => ({ order }))
  const from = vi.fn(() => ({ select }))
  const rpc = vi.fn()
  return { order, select, from, rpc }
})
vi.mock('../lib/supabase', () => ({ supabase: { from, rpc } }))

import { createWorkspace, listMine, updateWorkspace } from './workspacesRepo'

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

describe('workspace administration', () => {
  it('creates a workspace through the atomic RPC', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ workspace_id: 'w2', project_id: 'p2' }],
      error: null,
    })
    await expect(
      createWorkspace({ name: 'Acme', initialProjectName: 'Delivery', initialProjectKey: 'DEL' }),
    ).resolves.toEqual({ workspaceId: 'w2', projectId: 'p2' })
    expect(rpc).toHaveBeenCalledWith('create_workspace', {
      p_name: 'Acme',
      p_initial_project_name: 'Delivery',
      p_initial_project_key: 'DEL',
    })
  })

  it('updates a workspace and maps permission errors', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'w1', name: 'Renamed' }, error: null })
    await expect(updateWorkspace('w1', 'Renamed')).resolves.toMatchObject({ name: 'Renamed' })
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'denied' } })
    await expect(updateWorkspace('w1', 'Nope')).rejects.toThrow("You don't have permission")
  })
})
