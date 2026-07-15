import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, from, eq, inFilter } = vi.hoisted(() => {
  const inFilter = vi.fn()
  const eq = vi.fn(() => ({ in: inFilter }))
  const select = vi.fn(() => ({ eq }))
  return { rpc: vi.fn(), from: vi.fn(() => ({ select })), select, eq, inFilter }
})
vi.mock('../lib/supabase', () => ({ supabase: { rpc, from } }))

import {
  createTaskDependency,
  deleteTaskDependency,
  listTaskDependencyEdges,
  listTaskDependencies,
} from './dependenciesRepo'

beforeEach(() => vi.clearAllMocks())

describe('dependenciesRepo', () => {
  it('maps the graph RPC into predecessor/successor task context', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: 'd1',
          workspace_id: 'w1',
          predecessor_task_id: 't1',
          predecessor_ref: 'NIM-1',
          predecessor_title: 'Foundation',
          predecessor_status: 'todo',
          predecessor_start_date: '2026-07-01',
          predecessor_end_date: '2026-07-05',
          successor_task_id: 't2',
          successor_ref: 'NIM-2',
          successor_title: 'Application',
          successor_status: 'in_progress',
          successor_start_date: null,
          successor_end_date: null,
        },
      ],
      error: null,
    })
    await expect(listTaskDependencies('w1', 't2')).resolves.toEqual([
      {
        id: 'd1',
        workspaceId: 'w1',
        predecessor: {
          id: 't1',
          ref: 'NIM-1',
          title: 'Foundation',
          status: 'todo',
          startDate: '2026-07-01',
          endDate: '2026-07-05',
        },
        successor: {
          id: 't2',
          ref: 'NIM-2',
          title: 'Application',
          status: 'in_progress',
          startDate: null,
          endDate: null,
        },
      },
    ])
    expect(rpc).toHaveBeenCalledWith('query_task_dependencies', {
      p_workspace_id: 'w1',
      p_task_id: 't2',
    })
  })

  it('creates and deletes through guarded RPCs and propagates errors', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await createTaskDependency('t1', 't2')
    await deleteTaskDependency('d1')
    expect(rpc.mock.calls).toEqual([
      ['create_task_dependency', { p_predecessor_task_id: 't1', p_successor_task_id: 't2' }],
      ['delete_task_dependency', { p_dependency_id: 'd1' }],
    ])
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'cycle' } })
    await expect(createTaskDependency('t2', 't1')).rejects.toThrow('cycle')
  })

  it('bounds Gantt edge reads to loaded predecessor and successor IDs', async () => {
    inFilter.mockResolvedValueOnce({
      data: [
        { id: 'd1', predecessor_task_id: 't1', successor_task_id: 't2' },
        { id: 'd2', predecessor_task_id: 't1', successor_task_id: 'outside' },
      ],
      error: null,
    })
    await expect(listTaskDependencyEdges('w1', ['t1', 't2'])).resolves.toEqual([
      { id: 'd1', predecessor: { id: 't1' }, successor: { id: 't2' } },
    ])
    expect(from).toHaveBeenCalledWith('task_dependencies')
    expect(eq).toHaveBeenCalledWith('workspace_id', 'w1')
    expect(inFilter).toHaveBeenCalledWith('predecessor_task_id', ['t1', 't2'])
    await expect(listTaskDependencyEdges('w1', [])).resolves.toEqual([])
  })
})
