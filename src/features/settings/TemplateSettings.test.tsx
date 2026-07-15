import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { projects, templates, capture, instantiate, remove } = vi.hoisted(() => {
  const projects = { data: [{ id: 'p1', key: 'NIM', name: 'Nimbus' }] }
  const capture = { mutate: vi.fn(), isPending: false }
  const instantiate = { mutate: vi.fn(), isPending: false }
  const remove = { mutate: vi.fn(), isPending: false }
  const templates = {
    data: [
      {
        id: 'tpl1',
        name: 'Launch baseline',
        description: 'Reusable launch work',
        definition: {
          project: { name: 'Launch', color: '#123456', capacity_per_week: 36 },
          tasks: [
            {
              key: 'kickoff',
              title: 'Kickoff',
              subtasks: [{ title: 'Invite team' }],
              depends_on: [],
            },
            {
              key: 'ship',
              title: 'Ship',
              subtasks: [],
              depends_on: ['kickoff'],
            },
          ],
        },
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    capture,
    instantiate,
    remove,
  }
  return { projects, templates, capture, instantiate, remove }
})

vi.mock('../../lib/hooks/useProjects', () => ({ useProjects: () => projects }))
vi.mock('../../lib/hooks/useProjectTemplates', () => ({
  useProjectTemplates: () => templates,
}))

import { TemplateSettings } from './TemplateSettings'
import { expectNoA11yViolations } from '../../test-a11y'

beforeEach(() => vi.clearAllMocks())

describe('TemplateSettings', () => {
  it('captures a project with relative-date and capacity inputs', async () => {
    render(<TemplateSettings workspaceId="w1" />)
    await userEvent.type(screen.getByLabelText('Template name'), 'Delivery')
    await userEvent.type(screen.getByLabelText('Description (optional)'), 'Repeatable delivery')
    await userEvent.clear(screen.getByLabelText('Capacity assumption (hours/week)'))
    await userEvent.type(screen.getByLabelText('Capacity assumption (hours/week)'), '32')
    await userEvent.click(screen.getByRole('button', { name: 'Save project as template' }))

    expect(capture.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        name: 'Delivery',
        description: 'Repeatable delivery',
        capacityPerWeek: 32,
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('shows blueprint counts and instantiates a project', async () => {
    render(<TemplateSettings workspaceId="w1" />)
    expect(
      screen.getByText(/2 tasks · 1 subtasks · 1 dependencies · 36h\/week/),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Use template' }))
    expect(screen.getByLabelText('New project name')).toHaveValue('Launch')
    await userEvent.type(screen.getByLabelText('New project key'), 'lch')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(instantiate.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'tpl1', projectName: 'Launch', projectKey: 'LCH' }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('requires safe confirmation before deleting a template', async () => {
    render(<TemplateSettings workspaceId="w1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Delete template' }))
    expect(remove.mutate).toHaveBeenCalledWith(
      'tpl1',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('has no automated accessibility violations', async () => {
    const { container } = render(<TemplateSettings workspaceId="w1" />)
    await expectNoA11yViolations(container)
  })
})
