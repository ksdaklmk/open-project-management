import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { setRole, setCapacity, remove, transferOwnership } = vi.hoisted(() => ({
  setRole: { mutate: vi.fn(), isPending: false },
  setCapacity: { mutate: vi.fn(), isPending: false },
  remove: { mutate: vi.fn(), isPending: false },
  transferOwnership: { mutate: vi.fn(), isPending: false },
}))
const queryState = vi.hoisted(() => ({
  members: {
    data: [
      { user_id: 'u1', name: 'Ada', role: 'owner', capacity_per_week: 40 },
      { user_id: 'u2', name: 'Ben', role: 'member', capacity_per_week: 30 },
    ],
    isLoading: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  tasks: {
    data: [
      { id: 't1', assignee_id: 'u2' },
      { id: 't2', assignee_id: 'u2' },
    ],
    isLoading: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
}))
vi.mock('../../lib/hooks/useMembers', () => ({
  useMembers: () => queryState.members,
}))
vi.mock('../../lib/hooks/useTasks', () => ({
  useTasks: () => queryState.tasks,
}))
vi.mock('../../lib/hooks/useMemberAdmin', () => ({
  useMemberAdmin: () => ({ setRole, setCapacity, remove, transferOwnership }),
}))

import { MemberSettings } from './MemberSettings'

beforeEach(() => {
  vi.clearAllMocks()
  queryState.members.data = [
    { user_id: 'u1', name: 'Ada', role: 'owner', capacity_per_week: 40 },
    { user_id: 'u2', name: 'Ben', role: 'member', capacity_per_week: 30 },
  ]
  queryState.members.isLoading = false
  queryState.members.error = null
  queryState.tasks.isLoading = false
  queryState.tasks.error = null
})

describe('MemberSettings', () => {
  it('changes roles and capacity with permission-aware controls', async () => {
    render(<MemberSettings workspaceId="w1" actorId="u1" actorRole="owner" />)
    expect(screen.getByLabelText('Role for Ada')).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Role for Ben'), 'admin')
    expect(setRole.mutate).toHaveBeenCalledWith({ userId: 'u2', role: 'admin' })
    const capacity = screen.getByLabelText('Weekly capacity for Ben')
    await userEvent.clear(capacity)
    await userEvent.type(capacity, '24')
    await userEvent.tab()
    expect(setCapacity.mutate).toHaveBeenLastCalledWith({ userId: 'u2', capacity: 24 })
  })

  it('does not save an unchanged capacity when tabbing through the field', async () => {
    render(<MemberSettings workspaceId="w1" actorId="u1" actorRole="owner" />)
    screen.getByLabelText('Weekly capacity for Ben').focus()
    await userEvent.tab()
    expect(setCapacity.mutate).not.toHaveBeenCalled()
  })

  it('summarises unassignment and confirms removal safely', async () => {
    render(<MemberSettings workspaceId="w1" actorId="u1" actorRole="owner" />)
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' })
    await userEvent.click(removeButtons[1])
    expect(screen.getByText('2 tasks will become unassigned.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm remove' }))
    expect(remove.mutate).toHaveBeenCalledWith('u2', expect.any(Object))
    remove.mutate.mock.calls[0][1].onSuccess()
  })

  it('uses explicit confirmation for ownership transfer', async () => {
    render(<MemberSettings workspaceId="w1" actorId="u1" actorRole="owner" />)
    await userEvent.selectOptions(screen.getByLabelText('New owner'), 'u2')
    await userEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm transfer' }))
    expect(transferOwnership.mutate).toHaveBeenCalledWith('u2', expect.any(Object))
    transferOwnership.mutate.mock.calls[0][1].onSuccess()
  })

  it('prevents admins from removing owners or changing roles', () => {
    render(<MemberSettings workspaceId="w1" actorId="u2" actorRole="admin" />)
    expect(screen.getByLabelText('Role for Ben')).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Remove' })[0]).toBeDisabled()
    expect(screen.queryByText('Transfer ownership')).toBeNull()
  })

  it('disables removal while assignment counts load and supports retry on failure', async () => {
    queryState.tasks.isLoading = true
    const view = render(<MemberSettings workspaceId="w1" actorId="u1" actorRole="owner" />)
    expect(screen.getByText('Loading assignment counts…')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Remove' })[1]).toBeDisabled()
    queryState.tasks.isLoading = false
    queryState.tasks.error = new Error('down')
    view.rerender(<MemberSettings workspaceId="w1" actorId="u1" actorRole="owner" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Member removal is unavailable')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(queryState.tasks.refetch).toHaveBeenCalled()
  })

  it('renders an explicit empty member state', () => {
    queryState.members.data = []
    render(<MemberSettings workspaceId="w1" actorId="u1" actorRole="owner" />)
    expect(screen.getByText('No members found.')).toBeInTheDocument()
  })
})
