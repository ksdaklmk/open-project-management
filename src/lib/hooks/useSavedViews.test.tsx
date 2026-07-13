import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  listSavedViews,
  getDefaultSavedView,
  createSavedView,
  updateSavedView,
  duplicateSavedView,
  deleteSavedView,
  setDefaultSavedView,
} = vi.hoisted(() => ({
  listSavedViews: vi.fn(),
  getDefaultSavedView: vi.fn(),
  createSavedView: vi.fn(),
  updateSavedView: vi.fn(),
  duplicateSavedView: vi.fn(),
  deleteSavedView: vi.fn(),
  setDefaultSavedView: vi.fn(),
}))

vi.mock('../../data/savedViewsRepo', () => ({
  listSavedViews,
  getDefaultSavedView,
  createSavedView,
  updateSavedView,
  duplicateSavedView,
  deleteSavedView,
  setDefaultSavedView,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import {
  useCreateSavedView,
  useDefaultSavedView,
  useDeleteSavedView,
  useDuplicateSavedView,
  useSavedViews,
  useSetDefaultSavedView,
  useUpdateSavedView,
} from './useSavedViews'

const configuration = {
  filters: { status: [], priority: [], assignee: [], type: [], tag: [], q: '' },
  sort: 'priority' as const,
  group: 'status' as const,
}
const view = { id: 'v1', name: 'Launch', configuration }
const wrap = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

describe('saved-view hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listSavedViews.mockResolvedValue([view])
    getDefaultSavedView.mockResolvedValue(view)
    createSavedView.mockResolvedValue(view)
    updateSavedView.mockResolvedValue(view)
    duplicateSavedView.mockResolvedValue(view)
    deleteSavedView.mockResolvedValue(undefined)
    setDefaultSavedView.mockResolvedValue(undefined)
  })

  it('loads visible and default views with tenant-scoped keys', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(
      () => ({ list: useSavedViews('w1', 'list'), default: useDefaultSavedView('w1', 'list') }),
      { wrapper: wrap(client) },
    )
    await waitFor(() => expect(result.current.list.data).toEqual([view]))
    expect(result.current.default.data).toEqual(view)
    expect(listSavedViews).toHaveBeenCalledWith('w1', 'list')
    expect(getDefaultSavedView).toHaveBeenCalledWith('w1', 'list')
  })

  it('routes every mutation and invalidates list/default state', async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(
      () => ({
        create: useCreateSavedView('w1', 'list'),
        update: useUpdateSavedView('w1', 'list'),
        duplicate: useDuplicateSavedView('w1', 'list'),
        remove: useDeleteSavedView('w1', 'list'),
        setDefault: useSetDefaultSavedView('w1', 'list'),
      }),
      { wrapper: wrap(client) },
    )
    await act(() =>
      result.current.create.mutateAsync({ name: 'Launch', configuration, visibility: 'private' }),
    )
    await act(() =>
      result.current.update.mutateAsync({
        id: 'v1',
        name: 'Launch',
        configuration,
        visibility: 'workspace',
      }),
    )
    await act(() => result.current.duplicate.mutateAsync({ id: 'v1', name: 'Launch copy' }))
    await act(() => result.current.remove.mutateAsync('v1'))
    await act(() => result.current.setDefault.mutateAsync('v1'))
    await act(() => result.current.setDefault.mutateAsync(null))

    expect(createSavedView).toHaveBeenCalledWith({
      workspaceId: 'w1',
      viewType: 'list',
      name: 'Launch',
      configuration,
      visibility: 'private',
    })
    expect(updateSavedView).toHaveBeenCalled()
    expect(duplicateSavedView).toHaveBeenCalledWith('v1', 'Launch copy')
    expect(deleteSavedView).toHaveBeenCalledWith('v1')
    expect(setDefaultSavedView).toHaveBeenNthCalledWith(1, 'w1', 'list', 'v1')
    expect(setDefaultSavedView).toHaveBeenNthCalledWith(2, 'w1', 'list', null)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['saved-views', 'w1', 'list'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['saved-view-default', 'w1', 'list'] })
  })
})
