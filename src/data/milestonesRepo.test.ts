import { beforeEach, describe, expect, it, vi } from 'vitest'

const { from, eq, is, orderFirst, orderSecond, limit, rpc } = vi.hoisted(() => {
  const limit = vi.fn()
  const orderSecond = vi.fn(() => ({ limit }))
  const orderFirst = vi.fn(() => ({ order: orderSecond }))
  const is = vi.fn(() => ({ order: orderFirst }))
  const eq = vi.fn(() => ({ is }))
  const select = vi.fn(() => ({ eq }))
  return {
    from: vi.fn(() => ({ select })),
    select,
    eq,
    is,
    orderFirst,
    orderSecond,
    limit,
    rpc: vi.fn(),
  }
})

vi.mock('../lib/supabase', () => ({ supabase: { from, rpc } }))

import {
  createProjectMilestone,
  deleteProjectMilestone,
  listProjectMilestones,
  updateProjectMilestone,
} from './milestonesRepo'

beforeEach(() => vi.clearAllMocks())

describe('milestonesRepo', () => {
  it('lists active-project milestones and maps project context', async () => {
    limit.mockResolvedValueOnce({
      data: [
        {
          id: 'm1',
          title: 'Beta',
          target_date: '2026-07-20',
          projects: { name: 'Nimbus', archived_at: null },
        },
      ],
      error: null,
    })
    await expect(listProjectMilestones('w1')).resolves.toEqual([
      { id: 'm1', title: 'Beta', target_date: '2026-07-20', projectName: 'Nimbus' },
    ])
    expect(from).toHaveBeenCalledWith('project_milestones')
    expect(eq).toHaveBeenCalledWith('workspace_id', 'w1')
    expect(is).toHaveBeenCalledWith('projects.archived_at', null)
    expect(orderFirst).toHaveBeenCalledWith('target_date')
    expect(orderSecond).toHaveBeenCalledWith('id')
    expect(limit).toHaveBeenCalledWith(500)
  })

  it('routes create, update, and delete through guarded RPCs', async () => {
    rpc.mockResolvedValue({ data: { id: 'm1' }, error: null })
    await createProjectMilestone({
      projectId: 'p1',
      title: 'Beta',
      targetDate: '2026-07-20',
      status: 'planned',
    })
    await updateProjectMilestone({
      milestoneId: 'm1',
      title: 'GA',
      targetDate: '2026-07-25',
      status: 'at_risk',
    })
    await deleteProjectMilestone('m1')
    expect(rpc.mock.calls).toEqual([
      [
        'create_project_milestone',
        {
          p_project_id: 'p1',
          p_title: 'Beta',
          p_target_date: '2026-07-20',
          p_status: 'planned',
        },
      ],
      [
        'update_project_milestone',
        {
          p_milestone_id: 'm1',
          p_title: 'GA',
          p_target_date: '2026-07-25',
          p_status: 'at_risk',
        },
      ],
      ['delete_project_milestone', { p_milestone_id: 'm1' }],
    ])
  })

  it('propagates read and mutation errors', async () => {
    limit.mockResolvedValueOnce({ data: null, error: { message: 'read failed' } })
    await expect(listProjectMilestones('w1')).rejects.toThrow('read failed')
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'write failed' } })
    await expect(deleteProjectMilestone('m1')).rejects.toThrow('write failed')
  })
})
