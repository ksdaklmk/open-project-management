import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MY_WORK_PAGE_SIZE, queryMyWork } from './myWorkRepo'

const { rpc, abortSignal } = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { rpc } }))

describe('myWorkRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rpc.mockReturnValue({ abortSignal })
  })

  it('maps the cross-workspace response and cursor', async () => {
    const rows = Array.from({ length: MY_WORK_PAGE_SIZE + 1 }, (_, index) => ({
      id: `t${index}`,
      workspace_id: 'w1',
      workspace_name: 'Workspace',
      project_id: 'p1',
      project_name: 'Project',
      project_key: 'PRJ',
      ref: `PRJ-${index}`,
      title: `Task ${index}`,
      type: 'feature',
      status: 'todo',
      priority: 'medium',
      start_date: null,
      end_date: null,
      points: null,
      updated_at: '2026-07-13T00:00:00Z',
      tags: index === 0 ? null : ['Frontend'],
      sort_value: `2026-07-13T00:00:${String(index).padStart(2, '0')}Z`,
    }))
    abortSignal.mockResolvedValue({ data: rows, error: null })

    const page = await queryMyWork('assigned')
    expect(page.items).toHaveLength(MY_WORK_PAGE_SIZE)
    expect(page.items[0]).toMatchObject({ workspaceId: 'w1', projectName: 'Project', tags: [] })
    expect(page.nextCursor).toEqual({
      id: 't99',
      sort: '2026-07-13T00:00:99Z',
    })
    expect(rpc).toHaveBeenCalledWith('query_my_work', {
      p_scope: 'assigned',
      p_cursor_sort: undefined,
      p_cursor_id: undefined,
      p_limit: 100,
    })
  })

  it('passes the stable cursor to the RPC', async () => {
    abortSignal.mockResolvedValue({ data: [], error: null })
    await queryMyWork('recent', { sort: 'time', id: 't1' })
    expect(rpc).toHaveBeenCalledWith(
      'query_my_work',
      expect.objectContaining({ p_cursor_sort: 'time', p_cursor_id: 't1' }),
    )
  })
})
