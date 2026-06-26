import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { useTasks, useMembers, useActiveWorkspace, setTaskRef, mutate } = vi.hoisted(() => ({
  useTasks: vi.fn(), useMembers: vi.fn(),
  useActiveWorkspace: vi.fn(() => ({ activeId: 'w1', setActiveId: vi.fn(), loading: false })),
  setTaskRef: vi.fn(),
  mutate: vi.fn(),
}))
vi.mock('../../lib/hooks/useTasks', () => ({ useTasks }))
vi.mock('../../lib/hooks/useMembers', () => ({ useMembers }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace }))
vi.mock('../../app/useViewState', () => ({ useViewState: () => ({ setTaskRef }) }))
vi.mock('../../lib/hooks/useUpdateTask', () => ({ useUpdateTask: () => ({ mutate }) }))

import { ListView } from './ListView'

beforeEach(() => {
  vi.clearAllMocks()
  useMembers.mockReturnValue({ data: [] })
})

describe('ListView', () => {
  it('renders a group with its task', () => {
    useTasks.mockReturnValue({ data: [{ id: 't1', ref: 'NIM-1', title: 'Hello', status: 'todo', priority: 'low', position: 0, type: 'feature', assignee_id: null, points: null }], isLoading: false, error: null })
    render(<ListView />)
    expect(screen.getByRole('heading', { name: /To Do/i })).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
  it('shows an empty state when there are no tasks', () => {
    useTasks.mockReturnValue({ data: [], isLoading: false, error: null })
    render(<ListView />)
    expect(screen.getByText(/no tasks/i)).toBeInTheDocument()
  })
  it('shows a loading state', () => {
    useTasks.mockReturnValue({ data: undefined, isLoading: true, error: null })
    render(<ListView />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
  it('shows an error state', () => {
    useTasks.mockReturnValue({ data: undefined, isLoading: false, error: new Error('fail') })
    render(<ListView />)
    expect(screen.getByText(/couldn.t load/i)).toBeInTheDocument()
  })
  it('patches a task when its status cell changes', async () => {
    useTasks.mockReturnValue({ data: [{ id: 't1', ref: 'NIM-1', title: 'Hello', status: 'todo', priority: 'low', position: 0, type: 'feature', assignee_id: null, points: null }], isLoading: false, error: null })
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<ListView />)
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'done')
    expect(mutate).toHaveBeenCalledWith({ id: 't1', patch: { status: 'done' } })
  })
})
