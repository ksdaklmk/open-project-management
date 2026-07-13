import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repos = vi.hoisted(() => ({
  acceptMyInvitations: vi.fn(),
  listInvitations: vi.fn(),
  sendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
}))
vi.mock('../../data/invitationsRepo', () => repos)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { toast } from 'sonner'
import { useInvitationAcceptance, useInvitations } from './useInvitations'

const wrap = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }

beforeEach(() => vi.clearAllMocks())

describe('invitation hooks', () => {
  it('accepts once per actor and refreshes workspaces when membership changes', async () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    repos.acceptMyInvitations.mockResolvedValueOnce(1)
    const { result } = renderHook(() => useInvitationAcceptance('u1'), {
      wrapper: wrap(queryClient),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(repos.acceptMyInvitations).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workspaces'] })
  })

  it('refreshes the invitation list after send and revoke', async () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    repos.listInvitations.mockResolvedValue([])
    repos.sendInvitation.mockResolvedValue({ invitationId: 'i1', message: 'Invitation ready.' })
    repos.revokeInvitation.mockResolvedValue({ id: 'i1' })
    const { result } = renderHook(() => useInvitations('w1'), { wrapper: wrap(queryClient) })
    result.current.send.mutate({ email: 'new@test.dev', role: 'member' })
    await waitFor(() => expect(result.current.send.isSuccess).toBe(true))
    expect(toast.success).toHaveBeenCalledWith('Invitation ready.')
    result.current.revoke.mutate('i1')
    await waitFor(() => expect(result.current.revoke.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['invitations', 'w1'] })
  })

  it('shows a delivery error from a failed send', async () => {
    const queryClient = new QueryClient()
    repos.listInvitations.mockResolvedValue([])
    repos.sendInvitation.mockRejectedValueOnce(new Error('Email provider unavailable.'))
    const { result } = renderHook(() => useInvitations('w1'), { wrapper: wrap(queryClient) })
    result.current.send.mutate({ email: 'new@test.dev', role: 'member' })
    await waitFor(() => expect(result.current.send.isError).toBe(true))
    expect(toast.error).toHaveBeenCalledWith('Email provider unavailable.')
  })
})
