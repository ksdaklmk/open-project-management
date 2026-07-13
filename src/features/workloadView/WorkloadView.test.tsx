import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { WorkloadPoint } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'

const { useWorkload, useMembers, useActiveWorkspace } = vi.hoisted(() => ({
  useWorkload: vi.fn(),
  useMembers: vi.fn(),
  useActiveWorkspace: vi.fn(() => ({ activeId: 'w1', setActiveId: vi.fn(), loading: false })),
}))
vi.mock('../../lib/hooks/useTasks', () => ({ useWorkload }))
vi.mock('../../lib/hooks/useMembers', () => ({ useMembers }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace }))

import { WorkloadView } from './WorkloadView'
import { expectNoA11yViolations } from '../../test-a11y'

const point = (over: Partial<WorkloadPoint>): WorkloadPoint => ({
  assigneeId: null,
  weekStart: null,
  points: 0,
  bucket: 'scheduled',
  ...over,
})
const m = (over: Partial<Member>): Member => ({
  user_id: 'u',
  role: 'member',
  capacity_per_week: 10,
  color: '#fff',
  name: 'User',
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('WorkloadView', () => {
  it('has no automated accessibility violations', async () => {
    useMembers.mockReturnValue({
      data: [m({ user_id: 'a', name: 'Alice' })],
      isLoading: false,
      error: null,
    })
    useWorkload.mockReturnValue({
      data: [point({ assigneeId: 'a', weekStart: '2026-06-29', points: 5 })],
      isLoading: false,
      error: null,
    })
    const { container } = render(<WorkloadView now={new Date(2026, 5, 28)} />)
    await expectNoA11yViolations(container)
  })

  it('renders an assignee row, an over-capacity cell, and the not-shown footer', () => {
    useMembers.mockReturnValue({
      data: [m({ user_id: 'a', name: 'Alice', capacity_per_week: 10 })],
      isLoading: false,
      error: null,
    })
    useWorkload.mockReturnValue({
      data: [
        point({ assigneeId: 'a', weekStart: '2026-06-29', points: 13 }),
        point({ bucket: 'unscheduled', points: 4 }),
      ],
      isLoading: false,
      error: null,
    })
    render(<WorkloadView now={new Date(2026, 5, 28)} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('cap 10/wk')).toBeInTheDocument()
    expect(screen.getByText('13')).toBeInTheDocument()
    expect(screen.getByText(/over capacity/i)).toBeInTheDocument() // sr-only marker on the over cell
    expect(screen.getByText(/4 points not shown/i)).toBeInTheDocument()
  })

  it('shows loading / error / empty states', () => {
    useMembers.mockReturnValue({ data: [], isLoading: false, error: null })
    useWorkload.mockReturnValue({ data: undefined, isLoading: true, error: null })
    const { rerender } = render(<WorkloadView />)
    expect(screen.getByRole('status')).toBeInTheDocument()

    useWorkload.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x') })
    useMembers.mockReturnValue({ data: [], isLoading: false, error: null })
    rerender(<WorkloadView />)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    useWorkload.mockReturnValue({ data: [], isLoading: false, error: null })
    useMembers.mockReturnValue({ data: [], isLoading: false, error: null })
    rerender(<WorkloadView />)
    expect(screen.getByText(/nothing to show yet/i)).toBeInTheDocument()
  })
})
