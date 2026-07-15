import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const state = vi.hoisted(() => ({
  create: { mutate: vi.fn(), isPending: false },
  update: { mutate: vi.fn(), isPending: false },
  remove: { mutate: vi.fn(), isPending: false },
  projects: { data: [{ id: 'p1', key: 'NIM', name: 'Nimbus' }] },
  milestones: {
    data: [
      {
        id: 'm1',
        project_id: 'p1',
        projectName: 'Nimbus',
        title: 'Public beta',
        target_date: '2026-07-20',
        status: 'planned',
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  },
}))

vi.mock('../../lib/hooks/useProjects', () => ({ useProjects: () => state.projects }))
vi.mock('../../lib/hooks/useMilestones', () => ({
  useMilestones: () => state.milestones,
  useMilestoneMutations: () => ({
    create: state.create,
    update: state.update,
    remove: state.remove,
  }),
}))

import { MilestoneSettings } from './MilestoneSettings'
import { expectNoA11yViolations } from '../../test-a11y'

beforeEach(() => vi.clearAllMocks())

describe('MilestoneSettings', () => {
  it('creates a dated project milestone', async () => {
    render(<MilestoneSettings workspaceId="w1" />)
    await userEvent.type(screen.getByLabelText('Milestone'), 'General availability')
    await userEvent.clear(screen.getByLabelText('Target date'))
    await userEvent.type(screen.getByLabelText('Target date'), '2026-07-25')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'at_risk')
    await userEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    expect(state.create.mutate).toHaveBeenCalledWith(
      {
        projectId: 'p1',
        title: 'General availability',
        targetDate: '2026-07-25',
        status: 'at_risk',
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('edits milestone fields and uses safe delete confirmation', async () => {
    render(<MilestoneSettings workspaceId="w1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const title = screen.getAllByLabelText('Milestone')[1]
    await userEvent.clear(title)
    await userEvent.type(title, 'General availability')
    await userEvent.selectOptions(screen.getAllByLabelText('Status')[1], 'complete')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(state.update.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        milestoneId: 'm1',
        title: 'General availability',
        status: 'complete',
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Delete milestone' }))
    expect(state.remove.mutate).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('has no automated accessibility violations', async () => {
    const { container } = render(<MilestoneSettings workspaceId="w1" />)
    await expectNoA11yViolations(container)
  })
})
