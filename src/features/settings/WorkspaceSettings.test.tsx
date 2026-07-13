import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  activeId: 'w1' as string | null,
  members: [{ user_id: 'u1', role: 'owner' }],
  setActiveId: vi.fn(),
  create: { mutate: vi.fn(), isPending: false },
  update: { mutate: vi.fn(), isPending: false },
}))
vi.mock('../../lib/workspace', () => ({
  useActiveWorkspace: () => ({ activeId: state.activeId, setActiveId: state.setActiveId }),
}))
vi.mock('../../lib/hooks/useSession', () => ({ useActorId: () => 'u1' }))
vi.mock('../../lib/hooks/useMembers', () => ({
  useMembers: () => ({ data: state.members, isLoading: false }),
}))
vi.mock('../../lib/hooks/useWorkspaces', () => ({
  useWorkspaces: () => ({ data: [{ id: 'w1', name: 'Acme' }], isLoading: false }),
}))
vi.mock('../../lib/hooks/useWorkspaceAdmin', () => ({
  useCreateWorkspace: () => state.create,
  useUpdateWorkspace: () => state.update,
}))
vi.mock('./ProjectSettings', () => ({ ProjectSettings: () => <div>Project settings mounted</div> }))
vi.mock('./MemberSettings', () => ({ MemberSettings: () => <div>Member settings mounted</div> }))
vi.mock('./InvitationSettings', () => ({
  InvitationSettings: () => <div>Invitation settings mounted</div>,
}))

import { WorkspaceSettings } from './WorkspaceSettings'
import { expectNoA11yViolations } from '../../test-a11y'

beforeEach(() => {
  vi.clearAllMocks()
  state.activeId = 'w1'
  state.members = [{ user_id: 'u1', role: 'owner' }]
})

describe('WorkspaceSettings', () => {
  it('has no automated accessibility violations', async () => {
    const { container } = render(<WorkspaceSettings />)
    await expectNoA11yViolations(container)
  })

  it('renames the workspace and mounts project/member settings for an owner', async () => {
    render(<WorkspaceSettings />)
    await userEvent.type(screen.getByLabelText('Display name'), 'Acme Two')
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(state.update.mutate).toHaveBeenCalledWith(
      { workspaceId: 'w1', name: 'Acme Two' },
      expect.any(Object),
    )
    state.update.mutate.mock.calls[0][1].onSuccess()
    expect(screen.getByText('Project settings mounted')).toBeInTheDocument()
    expect(screen.getByText('Invitation settings mounted')).toBeInTheDocument()
    expect(screen.getByText('Member settings mounted')).toBeInTheDocument()
  })

  it('denies direct settings access to an ordinary member', () => {
    state.members = [{ user_id: 'u1', role: 'member' }]
    render(<WorkspaceSettings />)
    expect(screen.getByRole('alert')).toHaveTextContent('Only workspace owners and admins')
    expect(screen.queryByText('Project settings mounted')).toBeNull()
  })

  it('creates an initial workspace/project from the empty state', async () => {
    state.activeId = null
    render(<WorkspaceSettings />)
    await userEvent.type(screen.getByLabelText('Workspace name'), 'New team')
    await userEvent.type(screen.getByLabelText('Initial project name'), 'Delivery')
    await userEvent.type(screen.getByLabelText('Project key'), 'del')
    await userEvent.click(screen.getByRole('button', { name: 'Create workspace' }))
    expect(state.create.mutate).toHaveBeenCalledWith(
      { name: 'New team', initialProjectName: 'Delivery', initialProjectKey: 'DEL' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    state.create.mutate.mock.calls[0][1].onSuccess({ workspaceId: 'w2' })
    expect(state.setActiveId).toHaveBeenCalledWith('w2')
  })
})
