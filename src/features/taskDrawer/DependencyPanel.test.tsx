import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const dependencyState = vi.hoisted(() => ({
  create: { mutate: vi.fn(), isPending: false },
  remove: { mutate: vi.fn(), isPending: false },
  data: [
    {
      id: 'd1',
      predecessor: {
        id: 't1',
        ref: 'NIM-101',
        title: 'Foundation',
        status: 'todo',
        startDate: '2026-07-01',
        endDate: '2026-07-05',
      },
      successor: {
        id: 't2',
        ref: 'NIM-102',
        title: 'Application',
        status: 'todo',
        startDate: '2026-07-04',
        endDate: '2026-07-10',
      },
    },
  ],
}))

vi.mock('../../lib/hooks/useTaskDependencies', () => ({
  useTaskDependencies: () => ({
    data: dependencyState.data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useDependencyCandidates: () => ({
    data: [
      { id: 't1', ref: 'NIM-101', title: 'Foundation' },
      { id: 't2', ref: 'NIM-102', title: 'Application' },
      { id: 't3', ref: 'NIM-103', title: 'Release' },
    ],
    isLoading: false,
  }),
  useTaskDependencyMutations: () => ({
    create: dependencyState.create,
    remove: dependencyState.remove,
  }),
}))

import { DependencyPanel, hasScheduleConflict } from './DependencyPanel'
import { expectNoA11yViolations } from '../../test-a11y'

const task = {
  id: 't2',
  ref: 'NIM-102',
  title: 'Application',
  status: 'todo',
  start_date: '2026-07-04',
  end_date: '2026-07-10',
} as any

beforeEach(() => vi.clearAllMocks())

describe('DependencyPanel', () => {
  it('shows blocker state and warns without rescheduling', () => {
    render(<DependencyPanel task={task} workspaceId="w1" />)
    expect(screen.getByText('Blocked by')).toBeInTheDocument()
    expect(
      screen.getByText(/Schedule warning: NIM-102 starts before NIM-101 finishes/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Dates are never moved automatically/)).toBeInTheDocument()
  })

  it('adds a new predecessor and removes an existing edge', async () => {
    render(<DependencyPanel task={task} workspaceId="w1" />)
    await userEvent.selectOptions(screen.getByLabelText('Add blocker'), 't3')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(dependencyState.create.mutate).toHaveBeenCalledWith(
      { predecessorTaskId: 't3', successorTaskId: 't2' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Remove dependency with NIM-101' }))
    expect(dependencyState.remove.mutate).toHaveBeenCalledWith('d1')
  })

  it('detects only predecessor-finish/successor-start inversions', () => {
    const predecessor = dependencyState.data[0].predecessor as any
    const successor = dependencyState.data[0].successor as any
    expect(hasScheduleConflict(predecessor, successor)).toBe(true)
    expect(hasScheduleConflict(predecessor, { ...successor, startDate: '2026-07-05' })).toBe(false)
  })

  it('has no automated accessibility violations', async () => {
    const { container } = render(<DependencyPanel task={task} workspaceId="w1" />)
    await expectNoA11yViolations(container)
  })
})
