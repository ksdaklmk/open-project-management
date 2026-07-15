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
const timelineData = vi.hoisted(() => ({ milestones: [] as any[] }))
vi.mock('../../lib/hooks/useMilestones', () => ({
  useMilestones: () => ({
    data: timelineData.milestones,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace }))
vi.mock('../../app/useViewState', () => ({ useViewState: () => ({ setTaskRef }) }))

import { TimelineView } from './TimelineView'
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
  timelineData.milestones = []
})

describe('TimelineView', () => {
  it('has no automated accessibility violations', async () => {
    useTasks.mockReturnValue({
      data: [
        t({ ref: 'NIM-101', title: 'Login', start_date: '2026-06-22' }),
        t({ ref: 'NIM-105', title: 'Emails' }),
      ],
      isLoading: false,
      error: null,
    })
    const { container } = render(inRouter(<TimelineView now={new Date(2026, 5, 25)} />))
    await expectNoA11yViolations(container)
  })

  it('opens a task with native Space-key button semantics', async () => {
    useTasks.mockReturnValue({
      data: [t({ ref: 'NIM-101', title: 'Login', start_date: '2026-06-22' })],
      isLoading: false,
      error: null,
    })
    render(inRouter(<TimelineView now={new Date(2026, 5, 25)} />))
    const opener = screen.getByRole('button', { name: /Open NIM-101: Login/i })
    opener.focus()
    await userEvent.keyboard(' ')
    expect(setTaskRef).toHaveBeenCalledWith('NIM-101')
  })

  it('renders only the non-empty buckets with their tasks', () => {
    useTasks.mockReturnValue({
      data: [
        t({ ref: 'NIM-101', title: 'Login', start_date: '2026-06-22', end_date: '2026-06-26' }),
        t({ ref: 'NIM-105', title: 'Emails', start_date: null }),
      ],
      isLoading: false,
      error: null,
    })
    render(inRouter(<TimelineView now={new Date(2026, 5, 25)} />))
    expect(screen.getByText('NIM-101')).toBeInTheDocument()
    expect(screen.getByText(/Unscheduled/i)).toBeInTheDocument()
    expect(screen.queryByText('Earlier')).toBeNull() // empty bucket hidden
  })

  it('renders dated milestone markers independently of tasks', () => {
    useTasks.mockReturnValue({ data: [], isLoading: false, error: null })
    timelineData.milestones = [
      {
        id: 'm1',
        title: 'General availability',
        projectName: 'Nimbus',
        target_date: '2026-06-27',
        status: 'at_risk',
      },
    ]
    render(inRouter(<TimelineView now={new Date(2026, 5, 25)} />))
    expect(screen.getByText('General availability')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'at risk milestone' })).toBeInTheDocument()
  })

  it('shows loading / error / empty states', () => {
    useTasks.mockReturnValue({ data: undefined, isLoading: true, error: null })
    const { rerender } = render(inRouter(<TimelineView />))
    expect(screen.getByRole('status')).toBeInTheDocument()

    useTasks.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x') })
    rerender(inRouter(<TimelineView />))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    useTasks.mockReturnValue({ data: [], isLoading: false, error: null })
    rerender(inRouter(<TimelineView />))
    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument()
  })
})
