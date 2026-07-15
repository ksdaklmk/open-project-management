import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Task } from '../../data/tasksRepo'

const { useTasks, useActiveWorkspace, setTaskRef } = vi.hoisted(() => ({
  useTasks: vi.fn(),
  useActiveWorkspace: vi.fn(() => ({ activeId: 'w1', setActiveId: vi.fn(), loading: false })),
  setTaskRef: vi.fn(),
}))
vi.mock('../../lib/hooks/useTasks', () => ({ useTasks }))
const ganttData = vi.hoisted(() => ({
  milestones: [] as any[],
  dependencies: [] as any[],
}))
vi.mock('../../lib/hooks/useMilestones', () => ({
  useMilestones: () => ({
    data: ganttData.milestones,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))
vi.mock('../../lib/hooks/useTaskDependencies', () => ({
  useTaskDependencyEdges: () => ({
    data: ganttData.dependencies,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace }))
vi.mock('../../app/useViewState', () => ({ useViewState: () => ({ setTaskRef }) }))

import { GanttView } from './GanttView'
import { expectNoA11yViolations } from '../../test-a11y'

const inRouter = (ui: React.ReactElement) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {ui}
  </MemoryRouter>
)

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

beforeEach(() => {
  vi.clearAllMocks()
  ganttData.milestones = []
  ganttData.dependencies = []
})

describe('GanttView', () => {
  it('has no automated accessibility violations', async () => {
    useTasks.mockReturnValue({
      data: [
        t({
          id: 'a',
          ref: 'NIM-101',
          title: 'Login',
          start_date: '2026-06-22',
          end_date: '2026-06-26',
        }),
        t({ id: 'b', ref: 'NIM-105', title: 'Emails' }),
      ],
      isLoading: false,
      error: null,
    })
    const { container } = render(inRouter(<GanttView now={new Date(2026, 5, 25)} />))
    await expectNoA11yViolations(container)
  })

  it('opens scheduled and unscheduled tasks with native buttons', async () => {
    useTasks.mockReturnValue({
      data: [
        t({
          id: 'a',
          ref: 'NIM-101',
          title: 'Login',
          start_date: '2026-06-22',
          end_date: '2026-06-26',
        }),
        t({ id: 'b', ref: 'NIM-105', title: 'Emails' }),
      ],
      isLoading: false,
      error: null,
    })
    render(inRouter(<GanttView now={new Date(2026, 5, 25)} />))
    const scheduled = screen.getByRole('button', { name: /Open NIM-101: Login/i })
    scheduled.focus()
    await userEvent.keyboard('{Enter}')
    expect(setTaskRef).toHaveBeenCalledWith('NIM-101')
    await userEvent.click(screen.getByRole('button', { name: /Open NIM-105: Emails/i }))
    expect(setTaskRef).toHaveBeenCalledWith('NIM-105')
  })

  it('renders one bar per scheduled task, a today marker, and the unscheduled list', () => {
    useTasks.mockReturnValue({
      data: [
        t({
          id: 'a',
          ref: 'NIM-101',
          title: 'Login',
          start_date: '2026-06-22',
          end_date: '2026-06-26',
        }),
        t({ id: 'b', ref: 'NIM-105', title: 'Emails', start_date: null, end_date: null }),
      ],
      isLoading: false,
      error: null,
    })
    render(inRouter(<GanttView now={new Date(2026, 5, 25)} />))
    expect(screen.getByRole('button', { name: /Open NIM-101: Login/i })).toBeInTheDocument()
    expect(screen.getByTestId('gantt-today')).toBeInTheDocument()
    expect(screen.getByText(/Unscheduled/i)).toBeInTheDocument()
    expect(screen.getByText('NIM-105')).toBeInTheDocument()
  })

  it('renders milestone markers and dependency connectors', () => {
    useTasks.mockReturnValue({
      data: [
        t({ id: 'a', ref: 'NIM-101', start_date: '2026-06-22', end_date: '2026-06-24' }),
        t({ id: 'b', ref: 'NIM-102', start_date: '2026-06-25', end_date: '2026-06-28' }),
      ],
      isLoading: false,
      error: null,
    })
    ganttData.milestones = [
      {
        id: 'm1',
        title: 'Beta',
        projectName: 'Nimbus',
        target_date: '2026-06-27',
        status: 'planned',
      },
    ]
    ganttData.dependencies = [
      {
        id: 'd1',
        predecessor: { id: 'a' },
        successor: { id: 'b' },
      },
    ]
    render(inRouter(<GanttView now={new Date(2026, 5, 25)} />))
    expect(screen.getByRole('img', { name: /Beta, Nimbus/ })).toBeInTheDocument()
    expect(screen.getByTestId('gantt-dependencies')).toBeInTheDocument()
  })

  it('shows the no-scheduled message when every task is undated', () => {
    useTasks.mockReturnValue({
      data: [t({ ref: 'NIM-105', start_date: null, end_date: null })],
      isLoading: false,
      error: null,
    })
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
