import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'

const { useTasks, useMembers, useActiveWorkspace } = vi.hoisted(() => ({
  useTasks: vi.fn(),
  useMembers: vi.fn(),
  useActiveWorkspace: vi.fn(() => ({ activeId: 'w1', setActiveId: vi.fn(), loading: false })),
}))
vi.mock('../../lib/hooks/useTasks', () => ({ useTasks }))
vi.mock('../../lib/hooks/useMembers', () => ({ useMembers }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace }))

import { WorkloadView } from './WorkloadView'

const t = (over: Partial<Task>): Task => ({
  id: 'x',
  project_id: 'p',
  workspace_id: 'w',
  ref: 'NIM-1',
  type: 'feature',
  title: 't',
  description: '',
  status: 'todo',
  priority: 'low',
  assignee_id: null,
  start_date: null,
  end_date: null,
  points: null,
  position: 0,
  created_by: null,
  created_at: '',
  updated_at: '',
  tags: [],
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
  it('renders an assignee row, an over-capacity cell, and the not-shown footer', () => {
    useMembers.mockReturnValue({
      data: [m({ user_id: 'a', name: 'Alice', capacity_per_week: 10 })],
      isLoading: false,
      error: null,
    })
    useTasks.mockReturnValue({
      data: [
        t({ id: '1', assignee_id: 'a', start_date: '2026-06-29', points: 13, status: 'todo' }),
        t({ id: '2', assignee_id: 'a', start_date: null, points: 4, status: 'todo' }),
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
    useTasks.mockReturnValue({ data: undefined, isLoading: true, error: null })
    const { rerender } = render(<WorkloadView />)
    expect(screen.getByRole('status')).toBeInTheDocument()

    useTasks.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x') })
    useMembers.mockReturnValue({ data: [], isLoading: false, error: null })
    rerender(<WorkloadView />)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    useTasks.mockReturnValue({ data: [], isLoading: false, error: null })
    useMembers.mockReturnValue({ data: [], isLoading: false, error: null })
    rerender(<WorkloadView />)
    expect(screen.getByText(/nothing to show yet/i)).toBeInTheDocument()
  })
})
