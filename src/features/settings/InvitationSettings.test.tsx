import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { send, revoke, invitationQuery } = vi.hoisted(() => ({
  send: { mutate: vi.fn(), isPending: false },
  revoke: { mutate: vi.fn(), isPending: false },
  invitationQuery: {
    data: [] as Array<Record<string, unknown>>,
    isLoading: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
}))
vi.mock('../../lib/hooks/useInvitations', () => ({
  useInvitations: () => ({ invitations: invitationQuery, send, revoke }),
}))

import { InvitationSettings } from './InvitationSettings'

beforeEach(() => {
  vi.clearAllMocks()
  invitationQuery.data = []
  invitationQuery.isLoading = false
  invitationQuery.error = null
})

describe('InvitationSettings', () => {
  it('lets an owner invite an admin and clears the form after success', async () => {
    render(<InvitationSettings workspaceId="w1" actorRole="owner" />)
    await userEvent.type(screen.getByLabelText('Email address'), 'new@test.dev')
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'admin')
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(send.mutate).toHaveBeenCalledWith(
      { email: 'new@test.dev', role: 'admin' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    act(() => send.mutate.mock.calls[0][1].onSuccess())
    expect(screen.getByLabelText('Email address')).toHaveValue('')
  })

  it('does not offer the admin role to an admin caller', () => {
    render(<InvitationSettings workspaceId="w1" actorRole="admin" />)
    expect(screen.queryByRole('option', { name: 'Admin' })).toBeNull()
  })

  it('rejects an invalid invitation email before mutation', async () => {
    render(<InvitationSettings workspaceId="w1" actorRole="owner" />)
    await userEvent.type(screen.getByLabelText('Email address'), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(send.mutate).not.toHaveBeenCalled()
  })

  it('shows lifecycle states and supports resend and revoke', async () => {
    invitationQuery.data = [
      {
        id: 'pending',
        email_normalized: 'pending@test.dev',
        role: 'member',
        accepted_at: null,
        revoked_at: null,
        expires_at: '2999-01-01T00:00:00Z',
      },
      {
        id: 'accepted',
        email_normalized: 'accepted@test.dev',
        role: 'member',
        accepted_at: '2026-01-01T00:00:00Z',
        revoked_at: null,
        expires_at: '2026-01-02T00:00:00Z',
      },
      {
        id: 'expired',
        email_normalized: 'expired@test.dev',
        role: 'member',
        accepted_at: null,
        revoked_at: null,
        expires_at: '2020-01-01T00:00:00Z',
      },
      {
        id: 'revoked',
        email_normalized: 'revoked@test.dev',
        role: 'member',
        accepted_at: null,
        revoked_at: '2026-01-01T00:00:00Z',
        expires_at: '2999-01-01T00:00:00Z',
      },
    ]
    render(<InvitationSettings workspaceId="w1" actorRole="owner" />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Accepted')).toBeInTheDocument()
    expect(screen.getByText('Expired')).toBeInTheDocument()
    expect(screen.getByText('Revoked')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Resend' })[0])
    expect(send.mutate).toHaveBeenCalledWith({ email: 'pending@test.dev', role: 'member' })
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    expect(revoke.mutate).toHaveBeenCalledWith('pending')
  })

  it('supports retry when invitation state cannot load', async () => {
    invitationQuery.error = new Error('down')
    render(<InvitationSettings workspaceId="w1" actorRole="owner" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load invitations')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(invitationQuery.refetch).toHaveBeenCalled()
  })
})
