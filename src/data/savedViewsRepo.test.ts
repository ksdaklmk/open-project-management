import { beforeEach, describe, expect, it, vi } from 'vitest'

const { from, select, workspaceEq, viewEq, orderName, orderId, rpc } = vi.hoisted(() => {
  const orderId = vi.fn()
  const orderName = vi.fn(() => ({ order: orderId }))
  const viewEq = vi.fn(() => ({ order: orderName }))
  const workspaceEq = vi.fn(() => ({ eq: viewEq }))
  const select = vi.fn(() => ({ eq: workspaceEq }))
  const from = vi.fn(() => ({ select }))
  const rpc = vi.fn()
  return { from, select, workspaceEq, viewEq, orderName, orderId, rpc }
})

vi.mock('../lib/supabase', () => ({ supabase: { from, rpc } }))

import {
  createSavedView,
  deleteSavedView,
  duplicateSavedView,
  getDefaultSavedView,
  listSavedViews,
  setDefaultSavedView,
  updateSavedView,
  type SavedViewConfiguration,
} from './savedViewsRepo'

const configuration: SavedViewConfiguration = {
  filters: {
    status: ['todo'],
    priority: [],
    assignee: [],
    type: [],
    tag: [],
    q: 'launch',
  },
  sort: 'due',
  group: 'status',
}
const row = {
  id: 'v1',
  workspace_id: 'w1',
  owner_id: 'u1',
  name: 'Launch',
  view_type: 'list' as const,
  configuration,
  visibility: 'private' as const,
  created_at: '2026-07-13T00:00:00Z',
  updated_at: '2026-07-13T00:00:00Z',
}

beforeEach(() => vi.clearAllMocks())

describe('savedViewsRepo', () => {
  it('lists visible views for one workspace and view type', async () => {
    orderId.mockResolvedValue({ data: [row], error: null })
    await expect(listSavedViews('w1', 'list')).resolves.toEqual([
      expect.objectContaining({
        id: 'v1',
        workspaceId: 'w1',
        ownerId: 'u1',
        configuration,
      }),
    ])
    expect(from).toHaveBeenCalledWith('saved_views')
    expect(select).toHaveBeenCalledWith('*')
    expect(workspaceEq).toHaveBeenCalledWith('workspace_id', 'w1')
    expect(viewEq).toHaveBeenCalledWith('view_type', 'list')
    expect(orderName).toHaveBeenCalledWith('name')
    expect(orderId).toHaveBeenCalledWith('id')
  })

  it('returns an empty list and surfaces list errors', async () => {
    orderId.mockResolvedValueOnce({ data: null, error: null })
    await expect(listSavedViews('w1', 'list')).resolves.toEqual([])
    orderId.mockResolvedValueOnce({ data: null, error: { message: 'denied' } })
    await expect(listSavedViews('w1', 'list')).rejects.toThrow('denied')
  })

  it('routes create and update through the validated RPCs', async () => {
    rpc.mockResolvedValue({ data: row, error: null })
    await createSavedView({
      workspaceId: 'w1',
      name: 'Launch',
      viewType: 'list',
      configuration,
      visibility: 'private',
    })
    await updateSavedView({
      id: 'v1',
      name: 'Launch plan',
      configuration,
      visibility: 'workspace',
    })
    expect(rpc.mock.calls).toEqual([
      [
        'create_saved_view',
        {
          p_workspace_id: 'w1',
          p_name: 'Launch',
          p_view_type: 'list',
          p_configuration: configuration,
          p_visibility: 'private',
        },
      ],
      [
        'update_saved_view',
        {
          p_saved_view_id: 'v1',
          p_name: 'Launch plan',
          p_configuration: configuration,
          p_visibility: 'workspace',
        },
      ],
    ])
  })

  it('duplicates and deletes through owner-aware RPCs', async () => {
    rpc.mockResolvedValue({ data: row, error: null })
    await duplicateSavedView('v1', 'Launch copy')
    await deleteSavedView('v1')
    expect(rpc.mock.calls).toEqual([
      ['duplicate_saved_view', { p_saved_view_id: 'v1', p_name: 'Launch copy' }],
      ['delete_saved_view', { p_saved_view_id: 'v1' }],
    ])
  })

  it('sets, clears, and resolves a personal default', async () => {
    rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: [row], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
    await setDefaultSavedView('w1', 'list', 'v1')
    await setDefaultSavedView('w1', 'list', null)
    await expect(getDefaultSavedView('w1', 'list')).resolves.toEqual(
      expect.objectContaining({ id: 'v1' }),
    )
    await expect(getDefaultSavedView('w1', 'list')).resolves.toBeNull()
    expect(rpc.mock.calls.slice(0, 2)).toEqual([
      [
        'set_default_saved_view',
        { p_workspace_id: 'w1', p_view_type: 'list', p_saved_view_id: 'v1' },
      ],
      ['set_default_saved_view', { p_workspace_id: 'w1', p_view_type: 'list' }],
    ])
  })

  it('surfaces mutation errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not allowed' } })
    await expect(deleteSavedView('v1')).rejects.toThrow('not allowed')
    await expect(getDefaultSavedView('w1', 'list')).rejects.toThrow('not allowed')
  })
})
