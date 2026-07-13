import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MyWorkView } from './MyWorkView'
import { expectNoA11yViolations } from '../../test-a11y'

const { setActiveId, setTaskRef, work } = vi.hoisted(() => ({
  setActiveId: vi.fn(),
  setTaskRef: vi.fn(),
  work: {
    data: [
      {
        id: 't1',
        workspaceId: 'w2',
        workspaceName: 'Acme',
        projectId: 'p1',
        projectName: 'Website',
        projectKey: 'WEB',
        ref: 'WEB-1',
        title: 'Ship homepage',
        type: 'feature',
        status: 'todo',
        priority: 'high',
        startDate: null,
        endDate: '2026-07-20',
        points: 3,
        updatedAt: '2026-07-13T00:00:00Z',
        tags: [],
        sortValue: '2026-07-13T00:00:00Z',
      },
    ],
    isLoading: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  },
}))
vi.mock('../../lib/hooks/useMyWork', () => ({ useMyWork: () => work }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace: () => ({ setActiveId }) }))
vi.mock('../../app/useViewState', () => ({ useViewState: () => ({ setTaskRef }) }))

describe('MyWorkView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens a cross-workspace task with the correct deep-link context', async () => {
    render(<MyWorkView />)
    await userEvent.click(screen.getByRole('button', { name: 'Open WEB-1: Ship homepage' }))
    expect(setActiveId).toHaveBeenCalledWith('w2')
    expect(setTaskRef).toHaveBeenCalledWith('WEB-1')
  })

  it('supports scope and grouping controls', async () => {
    render(<MyWorkView />)
    await userEvent.click(screen.getByRole('button', { name: 'Overdue' }))
    expect(screen.getByRole('button', { name: 'Overdue' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.selectOptions(screen.getByLabelText('Group My Work'), 'project')
    expect(screen.getByRole('heading', { name: /Acme \/ Website/ })).toBeInTheDocument()
  })

  it('has no automated accessibility violations', async () => {
    const { container } = render(<MyWorkView />)
    await expectNoA11yViolations(container)
  })
})
