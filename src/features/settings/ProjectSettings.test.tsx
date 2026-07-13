import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { projects, create, update, archive } = vi.hoisted(() => ({
  projects: {
    data: [{ id: 'p1', name: 'Nimbus', key: 'NIM' }],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  },
  create: { mutate: vi.fn(), isPending: false },
  update: { mutate: vi.fn(), isPending: false },
  archive: { mutate: vi.fn(), isPending: false },
}))
vi.mock('../../lib/hooks/useProjects', () => ({ useProjects: () => projects }))
vi.mock('../../lib/hooks/useProjectAdmin', () => ({
  useProjectAdmin: () => ({ create, update, archive }),
}))

import { ProjectSettings } from './ProjectSettings'

beforeEach(() => vi.clearAllMocks())

describe('ProjectSettings', () => {
  it('creates and renames projects with labelled keyboard-operable forms', async () => {
    render(<ProjectSettings workspaceId="w1" />)
    await userEvent.type(screen.getByLabelText('Project name'), 'Delivery')
    await userEvent.type(screen.getByLabelText('Key'), 'del')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(create.mutate).toHaveBeenCalledWith(
      { name: 'Delivery', key: 'DEL' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    create.mutate.mock.calls[0][1].onSuccess()
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const edit = screen.getAllByLabelText('Project name')[1]
    await userEvent.clear(edit)
    await userEvent.type(edit, 'Nimbus Two')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(update.mutate).toHaveBeenCalledWith(
      { projectId: 'p1', name: 'Nimbus Two' },
      expect.any(Object),
    )
    update.mutate.mock.calls[0][1].onSuccess()
  })

  it('rejects an invalid project key before mutation', async () => {
    render(<ProjectSettings workspaceId="w1" />)
    await userEvent.type(screen.getByLabelText('Project name'), 'Delivery')
    await userEvent.type(screen.getByLabelText('Key'), '1bad')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(create.mutate).not.toHaveBeenCalled()
  })

  it('requires a second confirmation and focuses Cancel before archive', async () => {
    render(<ProjectSettings workspaceId="w1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm archive' }))
    expect(archive.mutate).toHaveBeenCalledWith('p1', expect.any(Object))
    archive.mutate.mock.calls[0][1].onSuccess()
  })
})
