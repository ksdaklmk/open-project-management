import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectNoA11yViolations } from '../../test-a11y'
import { SavedViewsControl } from './SavedViewsControl'

const { hooks, toast } = vi.hoisted(() => ({
  hooks: {
    views: { data: [] as any[], isLoading: false, error: null as Error | null, refetch: vi.fn() },
    defaultView: { data: null as any, isSuccess: true },
    create: { mutate: vi.fn(), isPending: false },
    update: { mutate: vi.fn(), isPending: false },
    duplicate: { mutate: vi.fn(), isPending: false },
    remove: { mutate: vi.fn(), isPending: false },
    setDefault: { mutate: vi.fn(), isPending: false },
  },
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('../../lib/hooks/useSession', () => ({ useActorId: () => 'u1' }))
vi.mock('../../lib/hooks/useSavedViews', () => ({
  useSavedViews: () => hooks.views,
  useDefaultSavedView: () => hooks.defaultView,
  useCreateSavedView: () => hooks.create,
  useUpdateSavedView: () => hooks.update,
  useDuplicateSavedView: () => hooks.duplicate,
  useDeleteSavedView: () => hooks.remove,
  useSetDefaultSavedView: () => hooks.setDefault,
}))
vi.mock('sonner', () => ({ toast }))

const configuration = {
  filters: {
    status: ['todo'],
    priority: [],
    assignee: [],
    type: [],
    tag: ['API'],
    q: 'launch',
  },
  sort: 'due' as const,
  group: 'status' as const,
}
const view = {
  id: 'v1',
  workspaceId: 'w1',
  ownerId: 'u1',
  name: 'Launch plan',
  viewType: 'list' as const,
  configuration,
  visibility: 'workspace' as const,
  createdAt: '2026-07-13T00:00:00Z',
  updatedAt: '2026-07-13T00:00:00Z',
}

const renderControl = (overrides: Partial<React.ComponentProps<typeof SavedViewsControl>> = {}) => {
  const props = {
    workspaceId: 'w1',
    viewType: 'list' as const,
    configuration,
    savedViewId: null,
    hasExplicitConfiguration: true,
    onApply: vi.fn(),
    onClearSavedView: vi.fn(),
    ...overrides,
  }
  return { ...render(<SavedViewsControl {...props} />), props }
}

beforeEach(() => {
  vi.clearAllMocks()
  hooks.views.data = []
  hooks.views.isLoading = false
  hooks.views.error = null
  hooks.defaultView.data = null
  hooks.defaultView.isSuccess = true
})

describe('SavedViewsControl', () => {
  it('lists visible views and applies one without accessibility violations', async () => {
    hooks.views.data = [view]
    const { container, props } = renderControl()
    fireEvent.click(screen.getByLabelText('Saved views'))
    fireEvent.click(screen.getByRole('button', { name: /Launch plan/ }))
    expect(props.onApply).toHaveBeenCalledWith(configuration, 'v1')
    await expectNoA11yViolations(container)
  })

  it('creates the current configuration and applies the result', () => {
    const { props } = renderControl()
    fireEvent.click(screen.getByLabelText('Saved views'))
    fireEvent.click(screen.getByRole('button', { name: 'Save current' }))
    fireEvent.change(screen.getByLabelText('New saved view name'), {
      target: { value: 'My launch view' },
    })
    fireEvent.change(screen.getByLabelText('New saved view visibility'), {
      target: { value: 'workspace' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create saved view' }))
    expect(hooks.create.mutate).toHaveBeenCalledWith(
      { name: 'My launch view', configuration, visibility: 'workspace' },
      expect.any(Object),
    )
    hooks.create.mutate.mock.calls[0][1].onSuccess(view)
    expect(props.onApply).toHaveBeenCalledWith(configuration, 'v1')
  })

  it('updates, duplicates, defaults, and confirms deletion for an owned view', async () => {
    hooks.views.data = [view]
    const { props } = renderControl({ savedViewId: 'v1' })
    fireEvent.click(screen.getByLabelText('Saved views'))
    await waitFor(() => expect(screen.getByLabelText('Saved view name')).toHaveValue('Launch plan'))
    fireEvent.change(screen.getByLabelText('Saved view name'), {
      target: { value: 'Launch revised' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update with current filters' }))
    expect(hooks.update.mutate).toHaveBeenCalledWith(
      {
        id: 'v1',
        name: 'Launch revised',
        configuration,
        visibility: 'workspace',
      },
      expect.any(Object),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(hooks.duplicate.mutate).toHaveBeenCalledWith(
      { id: 'v1', name: 'Launch plan copy' },
      expect.any(Object),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Set as default' }))
    expect(hooks.setDefault.mutate).toHaveBeenCalledWith('v1')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    expect(hooks.remove.mutate).toHaveBeenCalledWith('v1', expect.any(Object))
    hooks.remove.mutate.mock.calls[0][1].onSuccess()
    expect(props.onClearSavedView).toHaveBeenCalled()
  })

  it('copies only a workspace-visible selected view link', async () => {
    hooks.views.data = [view]
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    renderControl({ savedViewId: 'v1' })
    fireEvent.click(screen.getByLabelText('Saved views'))
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(window.location.href))
    expect(toast.success).toHaveBeenCalledWith('Share link copied')
  })

  it('auto-applies a personal default only when the URL has no explicit configuration', async () => {
    hooks.views.data = [view]
    hooks.defaultView.data = view
    const { props } = renderControl({ hasExplicitConfiguration: false })
    await waitFor(() => expect(props.onApply).toHaveBeenCalledWith(configuration, 'v1'))
  })

  it('resolves an id-only share link through the visible saved-view list', async () => {
    hooks.views.data = [view]
    const { props } = renderControl({
      savedViewId: 'v1',
      hasExplicitConfiguration: false,
    })
    await waitFor(() => expect(props.onApply).toHaveBeenCalledWith(configuration, 'v1'))
  })
})
