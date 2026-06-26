import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { useTasks, useMembers, useActiveWorkspace } = vi.hoisted(() => ({
  useTasks: vi.fn(), useMembers: vi.fn(),
  useActiveWorkspace: vi.fn(() => ({ activeId: 'w1', setActiveId: vi.fn(), loading: false })),
}))
vi.mock('../../lib/hooks/useTasks', () => ({ useTasks }))
vi.mock('../../lib/hooks/useMembers', () => ({ useMembers }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace }))

import { BoardView } from './BoardView'

beforeEach(() => { vi.clearAllMocks(); useMembers.mockReturnValue({ data: [] }) })

describe('BoardView', () => {
  it('renders all five columns and a card', () => {
    useTasks.mockReturnValue({ data: [{ id: 't1', ref: 'NIM-1', title: 'Hello', status: 'todo', priority: 'low', position: 0, type: 'feature', assignee_id: null, points: null }], isLoading: false, error: null })
    render(<BoardView />)
    for (const label of ['Backlog', 'To Do', 'In Progress', 'In Review', 'Done'])
      expect(screen.getByRole('heading', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
