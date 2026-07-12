import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { useTasks, useMembers, useActiveWorkspace, setTaskRef, mutate, moveMutate } = vi.hoisted(
  () => ({
    useTasks: vi.fn(),
    useMembers: vi.fn(),
    useActiveWorkspace: vi.fn(() => ({
      activeId: 'w1' as string | null,
      setActiveId: vi.fn(),
      loading: false,
    })),
    setTaskRef: vi.fn(),
    mutate: vi.fn(),
    moveMutate: vi.fn(),
  }),
)
vi.mock('../../lib/hooks/useTasks', () => ({ useTasks }))
vi.mock('../../lib/hooks/useMembers', () => ({ useMembers }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace }))
vi.mock('../../app/useViewState', () => ({ useViewState: () => ({ setTaskRef }) }))
vi.mock('../../lib/hooks/useUpdateTask', () => ({ useUpdateTask: () => ({ mutate }) }))
vi.mock('../../lib/hooks/useMoveTask', () => ({ useMoveTask: () => ({ mutate: moveMutate }) }))

import { ListView } from './ListView'

const inRouter = (ui: React.ReactElement) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {ui}
  </MemoryRouter>
)

beforeEach(() => {
  vi.clearAllMocks()
  useMembers.mockReturnValue({ data: [] })
})

describe('ListView', () => {
  it('renders a group with its task', () => {
    useTasks.mockReturnValue({
      data: [
        {
          id: 't1',
          ref: 'NIM-1',
          title: 'Hello',
          status: 'todo',
          priority: 'low',
          position: 0,
          type: 'feature',
          assignee_id: null,
          points: null,
        },
      ],
      isLoading: false,
      error: null,
    })
    render(inRouter(<ListView />))
    expect(screen.getByRole('heading', { name: /To Do/i })).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
  it('shows an empty state when there are no tasks', () => {
    useTasks.mockReturnValue({ data: [], isLoading: false, error: null })
    render(inRouter(<ListView />))
    expect(screen.getByText(/no tasks/i)).toBeInTheDocument()
  })
  it('shows a loading state', () => {
    useTasks.mockReturnValue({ data: undefined, isLoading: true, error: null })
    render(inRouter(<ListView />))
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
  it('shows an error state', () => {
    useTasks.mockReturnValue({ data: undefined, isLoading: false, error: new Error('fail') })
    render(inRouter(<ListView />))
    expect(screen.getByText(/couldn.t load/i)).toBeInTheDocument()
  })
  it('shows the skeleton while workspaces are still loading (no false empty state)', () => {
    // cold load: workspaces in flight → activeId null → useTasks disabled (isLoading false, data undefined)
    useActiveWorkspace.mockReturnValueOnce({ activeId: null, setActiveId: vi.fn(), loading: true })
    useTasks.mockReturnValue({ data: undefined, isLoading: false, error: null })
    render(inRouter(<ListView />))
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText(/no tasks/i)).not.toBeInTheDocument()
  })
  it('moves a task (logs activity) when its status cell changes', async () => {
    useTasks.mockReturnValue({
      data: [
        {
          id: 't1',
          ref: 'NIM-1',
          title: 'Hello',
          status: 'todo',
          priority: 'low',
          position: 0,
          type: 'feature',
          assignee_id: null,
          points: null,
        },
      ],
      isLoading: false,
      error: null,
    })
    const { default: userEvent } = await import('@testing-library/user-event')
    render(inRouter(<ListView />))
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'done')
    expect(moveMutate).toHaveBeenCalledWith({
      taskId: 't1',
      toStatus: 'done',
      position: 0,
      fromStatus: 'todo',
    })
  })
})
