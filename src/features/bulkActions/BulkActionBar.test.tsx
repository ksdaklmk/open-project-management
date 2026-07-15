import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { useBulkTasks, preflightMutate, applyMutate, undoMutate, bulkState } = vi.hoisted(() => {
  const preflightMutate = vi.fn((_args: unknown, options?: { onSuccess?: () => void }) =>
    options?.onSuccess?.(),
  )
  const applyMutate = vi.fn((_args: unknown, options?: { onSuccess?: () => void }) =>
    options?.onSuccess?.(),
  )
  const undoMutate = vi.fn()
  const reset = vi.fn()
  const bulkState = {
    preflight: {
      data: {
        requestedCount: 2,
        willChangeCount: 2,
        unchangedCount: 0,
        skippedCount: 0,
      },
      isPending: false,
      mutate: preflightMutate,
      reset,
    },
    apply: { isPending: false, mutate: applyMutate },
    undo: { isPending: false, mutate: undoMutate },
    progress: null as null | {
      totalCount: number
      processedCount: number
    },
    lastResult: null as null | {
      operationId: string
      totalCount: number
      processedCount: number
      changedCount: number
      unchangedCount: number
      skippedCount: number
      failedCount: number
      undoableUntil: string | null
      complete: boolean
    },
    clearResult: vi.fn(),
  }
  return {
    useBulkTasks: vi.fn(() => bulkState),
    preflightMutate,
    applyMutate,
    undoMutate,
    reset,
    bulkState,
  }
})

vi.mock('../../lib/hooks/useBulkTasks', () => ({ useBulkTasks }))

import { BulkActionBar } from './BulkActionBar'
import { expectNoA11yViolations } from '../../test-a11y'

const props = {
  workspaceId: 'w1',
  taskIds: ['t1', 't2'],
  members: [
    { user_id: 'u1', name: 'Ada', role: 'owner' as const, capacity_per_week: 40, color: '' },
  ],
  projects: [{ id: 'p1', key: 'NIM', name: 'Nimbus' }],
  onClearSelection: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  bulkState.progress = null
  bulkState.lastResult = null
})

describe('BulkActionBar', () => {
  it('reviews counts before enabling an apply', async () => {
    render(<BulkActionBar {...props} />)

    expect(screen.getByRole('button', { name: 'Apply to 0' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))

    expect(preflightMutate).toHaveBeenCalledWith(
      { taskIds: ['t1', 't2'], action: { kind: 'status', value: 'todo' } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(screen.getByText(/2 will change, 0 already match/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Apply to 2' }))
    expect(applyMutate).toHaveBeenCalledWith(
      { taskIds: ['t1', 't2'], action: { kind: 'status', value: 'todo' } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('makes permanent deletion explicit and warns that it cannot be restored', async () => {
    render(<BulkActionBar {...props} />)

    await userEvent.selectOptions(screen.getByLabelText('Bulk action'), 'delete')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))

    expect(screen.getByRole('button', { name: 'Delete 2 permanently' })).toBeEnabled()
    expect(screen.getByText(/cannot be restored/i)).toBeInTheDocument()
  })

  it('builds each value-bearing server action from controlled inputs', async () => {
    render(<BulkActionBar {...props} />)
    const actionSelect = screen.getByLabelText('Bulk action')

    await userEvent.selectOptions(actionSelect, 'priority')
    await userEvent.selectOptions(screen.getByLabelText('Bulk action value'), 'urgent')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(preflightMutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: { kind: 'priority', value: 'urgent' } }),
      expect.anything(),
    )

    await userEvent.selectOptions(actionSelect, 'assignee')
    await userEvent.selectOptions(screen.getByLabelText('Bulk action value'), 'u1')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(preflightMutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: { kind: 'assignee', value: 'u1' } }),
      expect.anything(),
    )

    await userEvent.selectOptions(actionSelect, 'start_date')
    await userEvent.type(screen.getByLabelText('Bulk start date'), '2026-07-15')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(preflightMutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: { kind: 'start_date', value: '2026-07-15' } }),
      expect.anything(),
    )

    await userEvent.selectOptions(actionSelect, 'end_date')
    await userEvent.type(screen.getByLabelText('Bulk due date'), '2026-07-20')
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(preflightMutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: { kind: 'end_date', value: '2026-07-20' } }),
      expect.anything(),
    )

    for (const [kind, value] of [
      ['tag_add', 'Backend'],
      ['tag_remove', 'Backend'],
      ['project', 'p1'],
    ] as const) {
      await userEvent.selectOptions(actionSelect, kind)
      await userEvent.selectOptions(screen.getByLabelText('Bulk action value'), value)
      await userEvent.click(screen.getByRole('button', { name: 'Review' }))
      expect(preflightMutate).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: { kind, value } }),
        expect.anything(),
      )
    }

    for (const kind of ['clear_dates', 'archive'] as const) {
      await userEvent.selectOptions(actionSelect, kind)
      await userEvent.click(screen.getByRole('button', { name: 'Review' }))
      expect(preflightMutate).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: { kind } }),
        expect.anything(),
      )
    }
  })

  it('shows progress and a non-undoable partial result', async () => {
    bulkState.progress = { totalCount: 150, processedCount: 100 }
    bulkState.lastResult = {
      operationId: 'op2',
      totalCount: 150,
      processedCount: 100,
      changedCount: 100,
      unchangedCount: 0,
      skippedCount: 0,
      failedCount: 50,
      undoableUntil: null,
      complete: false,
    }
    render(<BulkActionBar {...props} taskIds={[]} />)

    expect(screen.getByText('100 / 150')).toBeInTheDocument()
    expect(screen.getByText(/50 not attempted/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(bulkState.clearResult).toHaveBeenCalled()
  })

  it('offers safe undo for a completed reversible action', async () => {
    bulkState.lastResult = {
      operationId: 'op1',
      totalCount: 2,
      processedCount: 2,
      changedCount: 2,
      unchangedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      undoableUntil: '2026-07-14T12:05:00Z',
      complete: true,
    }
    const { rerender } = render(<BulkActionBar {...props} taskIds={[]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Undo 2 changes' }))
    expect(undoMutate).toHaveBeenCalledWith('op1')

    rerender(<BulkActionBar {...props} taskIds={[]} />)
  })

  it('has no automated accessibility violations', async () => {
    const { container } = render(<BulkActionBar {...props} />)
    await expectNoA11yViolations(container)
  })
})
