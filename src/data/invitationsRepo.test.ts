import { beforeEach, describe, expect, it, vi } from 'vitest'

const { order, eq, from, rpc, invoke } = vi.hoisted(() => {
  const order = vi.fn()
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { order, eq, from, rpc: vi.fn(), invoke: vi.fn() }
})
vi.mock('../lib/supabase', () => ({ supabase: { from, rpc, functions: { invoke } } }))

import {
  acceptMyInvitations,
  listInvitations,
  revokeInvitation,
  sendInvitation,
} from './invitationsRepo'

beforeEach(() => vi.clearAllMocks())

describe('invitations repository', () => {
  it('lists invitations for one workspace newest first', async () => {
    order.mockResolvedValueOnce({ data: [{ id: 'i1' }], error: null })
    await expect(listInvitations('w1')).resolves.toEqual([{ id: 'i1' }])
    expect(from).toHaveBeenCalledWith('workspace_invitations')
    expect(eq).toHaveBeenCalledWith('workspace_id', 'w1')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('sends through the Edge Function without exposing credentials', async () => {
    invoke.mockResolvedValueOnce({
      data: { invitationId: 'i1', message: 'Sent' },
      error: null,
    })
    await expect(sendInvitation('w1', 'person@test.dev', 'member')).resolves.toEqual({
      invitationId: 'i1',
      message: 'Sent',
    })
    expect(invoke).toHaveBeenCalledWith('invite-member', {
      body: { workspaceId: 'w1', email: 'person@test.dev', role: 'member' },
    })
  })

  it('surfaces provider delivery errors from the function response', async () => {
    const response = new Response(JSON.stringify({ error: 'Email provider unavailable.' }))
    invoke.mockResolvedValueOnce({ data: null, error: { context: response, message: 'non-2xx' } })
    await expect(sendInvitation('w1', 'person@test.dev', 'member')).rejects.toThrow(
      'Email provider unavailable.',
    )
  })

  it('revokes and accepts only through RPCs', async () => {
    rpc.mockResolvedValueOnce({ data: { id: 'i1', revoked_at: 'now' }, error: null })
    await expect(revokeInvitation('i1')).resolves.toMatchObject({ id: 'i1' })
    expect(rpc).toHaveBeenCalledWith('revoke_workspace_invitation', {
      p_invitation_id: 'i1',
    })
    rpc.mockResolvedValueOnce({ data: 2, error: null })
    await expect(acceptMyInvitations()).resolves.toBe(2)
    expect(rpc).toHaveBeenCalledWith('accept_workspace_invitations')
  })
})
