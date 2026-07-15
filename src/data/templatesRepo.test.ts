import { beforeEach, describe, expect, it, vi } from 'vitest'

const { order, eq, from, rpc } = vi.hoisted(() => {
  const order = vi.fn()
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  const rpc = vi.fn()
  return { order, eq, from, rpc }
})

vi.mock('../lib/supabase', () => ({ supabase: { from, rpc } }))

import {
  captureProjectTemplate,
  deleteProjectTemplate,
  instantiateProjectTemplate,
  listProjectTemplates,
} from './templatesRepo'

beforeEach(() => vi.clearAllMocks())

describe('templatesRepo', () => {
  it('lists workspace templates newest first', async () => {
    order.mockResolvedValueOnce({ data: [{ id: 'tpl1', name: 'Launch' }], error: null })
    await expect(listProjectTemplates('w1')).resolves.toEqual([{ id: 'tpl1', name: 'Launch' }])
    expect(from).toHaveBeenCalledWith('project_templates')
    expect(eq).toHaveBeenCalledWith('workspace_id', 'w1')
    expect(order).toHaveBeenCalledWith('updated_at', { ascending: false })
  })

  it('captures a project through the guarded snapshot RPC', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'tpl1', name: 'Launch' }, error: null })
    await captureProjectTemplate({
      projectId: 'p1',
      name: 'Launch',
      description: 'Reusable',
      anchorDate: '2026-07-14',
      capacityPerWeek: 40,
    })
    expect(rpc).toHaveBeenCalledWith('capture_project_template', {
      p_project_id: 'p1',
      p_name: 'Launch',
      p_description: 'Reusable',
      p_anchor_date: '2026-07-14',
      p_capacity_per_week: 40,
    })
  })

  it('maps transactional generation counts and deletes through RPCs', async () => {
    rpc
      .mockResolvedValueOnce({
        data: [{ project_id: 'p2', task_count: 4, dependency_count: 2 }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null })
    await expect(
      instantiateProjectTemplate({
        templateId: 'tpl1',
        projectName: 'Launch two',
        projectKey: 'LCH',
        anchorDate: '2026-08-01',
      }),
    ).resolves.toEqual({ projectId: 'p2', taskCount: 4, dependencyCount: 2 })
    await deleteProjectTemplate('tpl1')
    expect(rpc).toHaveBeenLastCalledWith('delete_project_template', { p_template_id: 'tpl1' })
  })

  it('rejects an empty generation response', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null })
    await expect(
      instantiateProjectTemplate({
        templateId: 'tpl1',
        projectName: 'X',
        projectKey: 'X',
        anchorDate: '2026-08-01',
      }),
    ).rejects.toThrow('no result')
  })
})
