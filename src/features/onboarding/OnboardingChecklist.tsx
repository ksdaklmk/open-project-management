import type { ViewId } from '../../app/useViewState'
import { useActivation } from '../../lib/hooks/useActivation'

interface Props {
  workspaceId: string
  isOwner: boolean
  setView: (view: ViewId) => void
}

interface Step {
  label: string
  complete: boolean
  detail?: string
  action?: { label: string; view: ViewId }
}

export function OnboardingChecklist({ workspaceId, isOwner, setView }: Props) {
  const { query, dismiss } = useActivation(workspaceId, isOwner)
  const status = query.data
  if (!isOwner || !status || status.dismissed || status.checklistComplete) return null

  const steps: Step[] = [
    { label: 'Create your workspace', complete: status.workspaceCreated },
    { label: 'Create the first project', complete: status.projectCreated },
    {
      label: 'Create five tasks',
      detail: `${Math.min(status.taskCount, 5)} of 5`,
      complete: status.taskCount >= 5,
      action: { label: 'Add tasks', view: 'list' },
    },
    {
      label: 'Invite a teammate',
      complete: status.invitationSent,
      action: { label: 'Invite', view: 'settings' },
    },
    {
      label: 'Work together once',
      detail: 'Your teammate signs in to this workspace',
      complete: status.secondMemberActive,
      action: { label: 'Manage members', view: 'settings' },
    },
    {
      label: 'Open planning view',
      detail: 'Visit Workload or Gantt',
      complete: status.coreViewOpened,
      action: { label: 'Explore Workload', view: 'workload' },
    },
  ]
  const completed = steps.filter((step) => step.complete).length

  return (
    <section
      className="mx-3 mb-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm"
      aria-labelledby="onboarding-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="opm-kicker">Getting started</p>
          <h2 id="onboarding-title" className="mt-1 font-semibold text-[var(--text)]">
            Set up your team’s first week
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {completed} of {steps.length} complete
          </p>
        </div>
        <button
          type="button"
          className="opm-btn"
          onClick={() => dismiss.mutate()}
          disabled={dismiss.isPending}
          aria-label="Dismiss getting started checklist"
        >
          {dismiss.isPending ? 'Dismissing…' : 'Dismiss'}
        </button>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"
        role="progressbar"
        aria-label="Onboarding progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={completed}
      >
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width]"
          style={{ width: `${(completed / steps.length) * 100}%` }}
        />
      </div>
      <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {steps.map((step) => (
          <li
            key={step.label}
            className="flex min-w-0 items-start gap-2 rounded-md bg-[var(--surface-2)] p-3"
          >
            <span
              className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-[var(--line)] text-xs font-bold"
              aria-hidden="true"
            >
              {step.complete ? '✓' : '·'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text)]">{step.label}</p>
              {step.detail && <p className="text-xs text-[var(--muted)]">{step.detail}</p>}
              {!step.complete && step.action && (
                <button
                  type="button"
                  className="mt-1 text-xs font-semibold text-[var(--accent-strong)] hover:underline"
                  onClick={() => setView(step.action!.view)}
                >
                  {step.action.label}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {dismiss.error && (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          Couldn’t dismiss the checklist. Try again.
        </p>
      )}
    </section>
  )
}
