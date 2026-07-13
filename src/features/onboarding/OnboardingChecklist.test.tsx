import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingChecklist } from './OnboardingChecklist'
import { expectNoA11yViolations } from '../../test-a11y'

const { activation, dismiss } = vi.hoisted(() => ({
  activation: {
    workspaceCreated: true,
    projectCreated: true,
    taskCount: 2,
    invitationSent: false,
    secondMemberActive: false,
    coreViewOpened: false,
    checklistComplete: false,
    activatedWithin7Days: false,
    dismissed: false,
  },
  dismiss: { mutate: vi.fn(), isPending: false, error: null as Error | null },
}))

vi.mock('../../lib/hooks/useActivation', () => ({
  useActivation: () => ({ query: { data: activation }, dismiss }),
}))

describe('OnboardingChecklist', () => {
  beforeEach(() => {
    dismiss.mutate.mockClear()
    dismiss.isPending = false
    dismiss.error = null
    activation.dismissed = false
    activation.checklistComplete = false
  })

  it('shows measured progress and routes owners to the next action', async () => {
    const setView = vi.fn()
    render(<OnboardingChecklist workspaceId="w1" isOwner setView={setView} />)
    expect(screen.getByText('2 of 5')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }))
    expect(setView).toHaveBeenCalledWith('settings')
  })

  it('persists an explicit dismissal', async () => {
    render(<OnboardingChecklist workspaceId="w1" isOwner setView={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss getting started checklist' }))
    expect(dismiss.mutate).toHaveBeenCalledTimes(1)
  })

  it('stays hidden for members, dismissed users, and completed workspaces', () => {
    const { rerender } = render(
      <OnboardingChecklist workspaceId="w1" isOwner={false} setView={vi.fn()} />,
    )
    expect(screen.queryByText('Set up your team’s first week')).toBeNull()

    activation.dismissed = true
    rerender(<OnboardingChecklist workspaceId="w1" isOwner setView={vi.fn()} />)
    expect(screen.queryByText('Set up your team’s first week')).toBeNull()

    activation.dismissed = false
    activation.checklistComplete = true
    rerender(<OnboardingChecklist workspaceId="w1" isOwner setView={vi.fn()} />)
    expect(screen.queryByText('Set up your team’s first week')).toBeNull()
  })

  it('has no automated accessibility violations', async () => {
    const { container } = render(<OnboardingChecklist workspaceId="w1" isOwner setView={vi.fn()} />)
    await expectNoA11yViolations(container)
  })
})
