import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Task } from '../../data/tasksRepo'

const { useTasks, useActiveWorkspace } = vi.hoisted(() => ({
  useTasks: vi.fn(),
  useActiveWorkspace: vi.fn(() => ({ activeId: 'w1', setActiveId: vi.fn(), loading: false })),
}))
vi.mock('../../lib/hooks/useTasks', () => ({ useTasks }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace }))

import { TimelineView } from './TimelineView'

const t = (over: Partial<Task>): Task => ({
  id: 'x', project_id: 'p', workspace_id: 'w', ref: 'NIM-1', type: 'feature',
  title: 't', description: '', status: 'todo', priority: 'low', assignee_id: null,
  start_date: null, end_date: null, points: null, position: 0,
  created_by: null, created_at: '', updated_at: '', tags: [], ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('TimelineView', () => {
  it('renders only the non-empty buckets with their tasks', () => {
    useTasks.mockReturnValue({
      data: [
        t({ ref: 'NIM-101', title: 'Login', start_date: '2026-06-22', end_date: '2026-06-26' }),
        t({ ref: 'NIM-105', title: 'Emails', start_date: null }),
      ],
      isLoading: false, error: null,
    })
    render(<TimelineView now={new Date(2026, 5, 25)} />)
    expect(screen.getByText('NIM-101')).toBeInTheDocument()
    expect(screen.getByText(/Unscheduled/i)).toBeInTheDocument()
    expect(screen.queryByText('Earlier')).toBeNull() // empty bucket hidden
  })

  it('shows loading / error / empty states', () => {
    useTasks.mockReturnValue({ data: undefined, isLoading: true, error: null })
    const { rerender } = render(<TimelineView />)
    expect(screen.getByRole('status')).toBeInTheDocument()

    useTasks.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x') })
    rerender(<TimelineView />)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    useTasks.mockReturnValue({ data: [], isLoading: false, error: null })
    rerender(<TimelineView />)
    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument()
  })
})
