import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectNoA11yViolations } from '../../test-a11y'

const { setActiveId, setTaskRef, markRead, markAll, updatePreference, state } = vi.hoisted(() => ({
  setActiveId: vi.fn(),
  setTaskRef: vi.fn(),
  markRead: vi.fn(),
  markAll: vi.fn(),
  updatePreference: vi.fn(),
  state: {
    notifications: [
      {
        id: 'n1',
        workspaceId: 'w2',
        actorId: 'u2',
        kind: 'mention' as const,
        taskId: 't1',
        taskRef: 'PRJ-101',
        commentId: 'c1',
        invitationId: null,
        createdAt: '2026-07-13T00:00:00Z',
        readAt: null,
      },
      {
        id: 'n2',
        workspaceId: 'w1',
        actorId: null,
        kind: 'invitation' as const,
        taskId: null,
        taskRef: null,
        commentId: null,
        invitationId: 'i1',
        createdAt: '2026-07-12T00:00:00Z',
        readAt: '2026-07-12T01:00:00Z',
      },
    ],
  },
}))

vi.mock('../../lib/workspace', () => ({
  useActiveWorkspace: () => ({ setActiveId }),
}))
vi.mock('../../app/useViewState', () => ({
  useViewState: () => ({ setTaskRef }),
}))
vi.mock('../../lib/hooks/useNotifications', () => ({
  useInbox: () => ({
    data: state.notifications,
    isLoading: false,
    error: null,
    hasNextPage: false,
    refetch: vi.fn(),
  }),
  useMarkNotificationRead: () => ({ mutate: markRead, isPending: false }),
  useMarkAllNotificationsRead: () => ({ mutate: markAll, isPending: false }),
  useUnreadNotifications: () => ({ data: 1 }),
  useNotificationPreferences: () => ({
    data: {
      user_id: 'u1',
      assignments: true,
      mentions: true,
      watched_comments: true,
      status_changes: true,
      invitations: true,
      due_soon: true,
      email_enabled: false,
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    update: { mutate: updatePreference, isPending: false },
  }),
}))

import { InboxView } from './InboxView'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('InboxView', () => {
  it('has no automated accessibility violations', async () => {
    const { container } = render(<InboxView />)
    await expectNoA11yViolations(container)
  })

  it('marks an unread task event and opens it in the correct workspace', () => {
    render(<InboxView />)
    fireEvent.click(screen.getByRole('button', { name: /mentioned on PRJ-101, unread/i }))
    expect(markRead).toHaveBeenCalledWith('n1')
    expect(setActiveId).toHaveBeenCalledWith('w2')
    expect(setTaskRef).toHaveBeenCalledWith('PRJ-101')
  })

  it('marks all loaded unread events and updates preferences', () => {
    render(<InboxView />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    expect(markAll).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mentions' }))
    expect(updatePreference).toHaveBeenCalledWith({ mentions: false })
    fireEvent.click(screen.getByRole('checkbox', { name: /Email notifications/ }))
    expect(updatePreference).toHaveBeenCalledWith({ email_enabled: true })
  })

  it('renders invitation events without exposing an address', () => {
    render(<InboxView />)
    expect(screen.getByText('You were invited to a workspace')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('@test.dev')
  })
})
