import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { useTasks, useMembers, useActiveWorkspace, moveMutate } = vi.hoisted(() => ({
  useTasks: vi.fn(),
  useMembers: vi.fn(),
  useActiveWorkspace: vi.fn(() => ({ activeId: 'w1', setActiveId: vi.fn(), loading: false })),
  moveMutate: vi.fn(),
}))
vi.mock('../../lib/hooks/useTasks', () => ({ useTasks }))
vi.mock('../../lib/hooks/useMembers', () => ({ useMembers }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace }))
vi.mock('../../lib/hooks/useMoveTask', () => ({ useMoveTask: () => ({ mutate: moveMutate }) }))
vi.mock('../../app/useViewState', () => ({ useViewState: () => ({ setTaskRef: vi.fn() }) }))

import { BoardView } from './BoardView'

const TASK = { id: 't1', ref: 'NIM-1', title: 'Hello', status: 'todo', priority: 'low', position: 0, type: 'feature', assignee_id: null, points: null, tags: [] }

beforeEach(() => { vi.clearAllMocks(); useMembers.mockReturnValue({ data: [] }) })

describe('BoardView', () => {
  it('renders all five columns and a card', () => {
    useTasks.mockReturnValue({ data: [TASK], isLoading: false, error: null })
    render(<BoardView />)
    for (const label of ['Backlog', 'To Do', 'In Progress', 'In Review', 'Done'])
      expect(screen.getByRole('heading', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    useTasks.mockReturnValue({ data: undefined, isLoading: true, error: null })
    render(<BoardView />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows error state', () => {
    useTasks.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x') })
    render(<BoardView />)
    expect(screen.getByText(/couldn't load tasks/i)).toBeInTheDocument()
  })

  it('moves a card when dropped on another column', () => {
    useTasks.mockReturnValue({ data: [TASK], isLoading: false, error: null })
    render(<BoardView />)

    const card = screen.getByText('Hello').closest('article')!
    const doneCol = screen.getByRole('heading', { name: /done/i }).closest('section')!

    // jsdom has neither DragEvent nor DataTransfer; TaskCard uses optional chaining (e.dataTransfer?.setData).
    // React routes events by name so plain Events with drag names still invoke onDragStart/onDrop handlers.
    card.dispatchEvent(new Event('dragstart', { bubbles: true }))
    doneCol.dispatchEvent(new Event('dragover', { bubbles: true }))
    doneCol.dispatchEvent(new Event('drop', { bubbles: true }))

    expect(moveMutate).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't1', toStatus: 'done', fromStatus: 'todo' })
    )
  })
})
