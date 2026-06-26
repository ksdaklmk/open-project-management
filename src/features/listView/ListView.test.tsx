import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { useTasks, useMembers, useActiveWorkspace, setTaskRef } = vi.hoisted(() => ({
  useTasks: vi.fn(), useMembers: vi.fn(),
  useActiveWorkspace: vi.fn(() => ({ activeId: 'w1', setActiveId: vi.fn(), loading: false })),
  setTaskRef: vi.fn(),
}))
vi.mock('../../lib/hooks/useTasks', () => ({ useTasks }))
vi.mock('../../lib/hooks/useMembers', () => ({ useMembers }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace }))
vi.mock('../../app/useViewState', () => ({ useViewState: () => ({ setTaskRef }) }))

import { ListView } from './ListView'

beforeEach(() => {
  vi.clearAllMocks()
  useMembers.mockReturnValue({ data: [] })
})

describe('ListView', () => {
  it('renders a group with its task', () => {
    useTasks.mockReturnValue({ data: [{ id: 't1', ref: 'NIM-1', title: 'Hello', status: 'todo', priority: 'low', position: 0, type: 'feature', assignee_id: null, points: null }], isLoading: false, error: null })
    render(<ListView />)
    expect(screen.getAllByText('To Do')[0]).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
  it('shows an empty state when there are no tasks', () => {
    useTasks.mockReturnValue({ data: [], isLoading: false, error: null })
    render(<ListView />)
    expect(screen.getByText(/no tasks/i)).toBeInTheDocument()
  })
})
