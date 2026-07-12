import { describe, it, expect, vi, beforeEach } from 'vitest'

const { order, eq, select, from, rpc } = vi.hoisted(() => {
  const order = vi.fn()
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  const rpc = vi.fn()
  return { order, eq, select, from, rpc }
})

vi.mock('../lib/supabase', () => ({ supabase: { from, rpc } }))

import { archiveProject, createProject, listProjects, updateProject } from './projectsRepo'

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

  it('routes create, update, and archive through typed RPCs', async () => {
    rpc.mockResolvedValue({ data: { id: 'p1', name: 'Delivery' }, error: null })
    await createProject('w1', 'Delivery', 'DEL')
    await updateProject('p1', 'Renamed')
    await archiveProject('p1')
    expect(rpc.mock.calls).toEqual([
      ['create_project', { p_workspace_id: 'w1', p_name: 'Delivery', p_key: 'DEL' }],
      ['update_project', { p_project_id: 'p1', p_name: 'Renamed' }],
      ['archive_project', { p_project_id: 'p1' }],
    ])
  })

  it('maps duplicate project keys', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'projects_workspace_id_key_key' },
    })
    await expect(createProject('w1', 'Duplicate', 'DEL')).rejects.toThrow('already in use')
  })
})
