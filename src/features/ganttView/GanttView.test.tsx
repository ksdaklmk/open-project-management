import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Task } from '../../data/tasksRepo'

const { useTasks, useActiveWorkspace } = vi.hoisted(() => ({
  useTasks: vi.fn(),
  useActiveWorkspace: vi.fn(() => ({ activeId: 'w1', setActiveId: vi.fn(), loading: false })),
}))
vi.mock('../../lib/hooks/useTasks', () => ({ useTasks }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace }))
vi.mock('../../app/useViewState', () => ({ useViewState: () => ({ setTaskRef: vi.fn() }) }))

import { GanttView } from './GanttView'

const inRouter = (ui: React.ReactElement) =>
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{ui}</MemoryRouter>

const t = (over: Partial<Task>): Task => ({
  id: 'x', project_id: 'p', workspace_id: 'w', ref: 'NIM-1', type: 'feature',
  title: 't', description: '', status: 'todo', priority: 'low', assignee_id: null,
  start_date: null, end_date: null, points: null, position: 0,
  created_by: null, created_at: '', updated_at: '', tags: [], ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('GanttView', () => {
  it('renders one bar per scheduled task, a today marker, and the unscheduled list', () => {
    useTasks.mockReturnValue({
      data: [
        t({ id: 'a', ref: 'NIM-101', title: 'Login', start_date: '2026-06-22', end_date: '2026-06-26' }),
        t({ id: 'b', ref: 'NIM-105', title: 'Emails', start_date: null, end_date: null }),
      ],
      isLoading: false, error: null,
    })
    render(inRouter(<GanttView now={new Date(2026, 5, 25)} />))
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByTestId('gantt-today')).toBeInTheDocument()
    expect(screen.getByText(/Unscheduled/i)).toBeInTheDocument()
    expect(screen.getByText('NIM-105')).toBeInTheDocument()
  })

  it('shows the no-scheduled message when every task is undated', () => {
    useTasks.mockReturnValue({ data: [t({ ref: 'NIM-105', start_date: null, end_date: null })], isLoading: false, error: null })
    render(inRouter(<GanttView />))
    expect(screen.getByText(/no scheduled tasks/i)).toBeInTheDocument()
    expect(screen.queryByTestId('gantt-today')).toBeNull()
  })

  it('shows loading / error / empty states', () => {
    useTasks.mockReturnValue({ data: undefined, isLoading: true, error: null })
    const { rerender } = render(inRouter(<GanttView />))
    expect(screen.getByRole('status')).toBeInTheDocument()

    useTasks.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x') })
    rerender(inRouter(<GanttView />))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    useTasks.mockReturnValue({ data: [], isLoading: false, error: null })
    rerender(inRouter(<GanttView />))
    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument()
  })
})
