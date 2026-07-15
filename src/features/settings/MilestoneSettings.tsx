import { useState, type FormEvent } from 'react'
import type { MilestoneStatus, ProjectMilestone } from '../../data/milestonesRepo'
import { useMilestoneMutations, useMilestones } from '../../lib/hooks/useMilestones'
import { useProjects } from '../../lib/hooks/useProjects'
import { MAX_TASK_DATE, MIN_TASK_DATE } from '../../lib/validation'

export const MILESTONE_STATUSES: Array<{ id: MilestoneStatus; label: string }> = [
  { id: 'planned', label: 'Planned' },
  { id: 'at_risk', label: 'At risk' },
  { id: 'complete', label: 'Complete' },
]

function localDate() {
  const value = new Date()
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset())
  return value.toISOString().slice(0, 10)
}

export function MilestoneSettings({ workspaceId }: { workspaceId: string }) {
  const projects = useProjects(workspaceId)
  const milestones = useMilestones(workspaceId)
  const mutations = useMilestoneMutations(workspaceId)
  const [projectId, setProjectId] = useState('')
  const [title, setTitle] = useState('')
  const [targetDate, setTargetDate] = useState(localDate)
  const [status, setStatus] = useState<MilestoneStatus>('planned')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const create = (event: FormEvent) => {
    event.preventDefault()
    const selectedProject = projectId || projects.data?.[0]?.id || ''
    if (!selectedProject || !title.trim()) return
    mutations.create.mutate(
      { projectId: selectedProject, title: title.trim(), targetDate, status },
      { onSuccess: () => setTitle('') },
    )
  }

  return (
    <section className="opm-settings-card" aria-labelledby="milestone-settings-title">
      <h2 id="milestone-settings-title" className="font-semibold text-[var(--text)]">
        Project milestones
      </h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Track dated delivery markers in Gantt and Timeline.
      </p>

      <form
        onSubmit={create}
        className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_10rem_9rem_auto] sm:items-end"
      >
        <label className="text-sm font-medium text-[var(--text)]">
          Milestone
          <input
            className="opm-input mt-1"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>
        <label className="text-sm font-medium text-[var(--text)]">
          Project
          <select
            className="opm-select mt-1"
            value={projectId || projects.data?.[0]?.id || ''}
            onChange={(event) => setProjectId(event.target.value)}
            required
          >
            {(projects.data ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.key} — {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--text)]">
          Target date
          <input
            className="opm-input mt-1"
            type="date"
            min={MIN_TASK_DATE}
            max={MAX_TASK_DATE}
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
            required
          />
        </label>
        <label className="text-sm font-medium text-[var(--text)]">
          Status
          <select
            className="opm-select mt-1"
            value={status}
            onChange={(event) => setStatus(event.target.value as MilestoneStatus)}
          >
            {MILESTONE_STATUSES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="opm-btn-primary"
          disabled={mutations.create.isPending || !projects.data?.length}
        >
          {mutations.create.isPending ? 'Adding…' : 'Add milestone'}
        </button>
      </form>

      {milestones.isLoading ? (
        <p className="mt-4 text-sm">Loading milestones…</p>
      ) : milestones.error ? (
        <div className="mt-4" role="alert">
          <p>Couldn’t load milestones.</p>
          <button className="opm-btn mt-2" onClick={() => milestones.refetch()}>
            Retry
          </button>
        </div>
      ) : !milestones.data?.length ? (
        <p className="mt-4 text-sm text-[var(--muted)]">No milestones yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--border)]">
          {milestones.data.map((milestone) => (
            <li key={milestone.id} className="py-3">
              {editingId === milestone.id ? (
                <MilestoneEditForm
                  milestone={milestone}
                  pending={mutations.update.isPending}
                  onCancel={() => setEditingId(null)}
                  onSave={(input) =>
                    mutations.update.mutate(input, { onSuccess: () => setEditingId(null) })
                  }
                />
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span aria-hidden="true" className="text-[var(--primary)]">
                    ◆
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[var(--text)]">{milestone.title}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {milestone.projectName} · {milestone.target_date} ·{' '}
                      {MILESTONE_STATUSES.find((item) => item.id === milestone.status)?.label}
                    </p>
                  </div>
                  {deletingId !== milestone.id && (
                    <>
                      <button className="opm-btn" onClick={() => setEditingId(milestone.id)}>
                        Edit
                      </button>
                      <button className="opm-btn" onClick={() => setDeletingId(milestone.id)}>
                        Delete
                      </button>
                    </>
                  )}
                  {deletingId === milestone.id && (
                    <div
                      className="flex items-center gap-2"
                      role="group"
                      aria-label={`Confirm delete ${milestone.title}`}
                    >
                      <span className="text-sm">Delete this milestone?</span>
                      <button autoFocus className="opm-btn" onClick={() => setDeletingId(null)}>
                        Cancel
                      </button>
                      <button
                        className="opm-btn-danger"
                        disabled={mutations.remove.isPending}
                        onClick={() =>
                          mutations.remove.mutate(milestone.id, {
                            onSuccess: () => setDeletingId(null),
                          })
                        }
                      >
                        {mutations.remove.isPending ? 'Deleting…' : 'Delete milestone'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function MilestoneEditForm({
  milestone,
  pending,
  onCancel,
  onSave,
}: {
  milestone: ProjectMilestone
  pending: boolean
  onCancel: () => void
  onSave: (input: {
    milestoneId: string
    title: string
    targetDate: string
    status: MilestoneStatus
  }) => void
}) {
  const [title, setTitle] = useState(milestone.title)
  const [targetDate, setTargetDate] = useState(milestone.target_date)
  const [status, setStatus] = useState(milestone.status)
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_10rem_9rem_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault()
        onSave({ milestoneId: milestone.id, title: title.trim(), targetDate, status })
      }}
    >
      <label className="text-sm font-medium text-[var(--text)]">
        Milestone
        <input
          autoFocus
          className="opm-input mt-1"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </label>
      <label className="text-sm font-medium text-[var(--text)]">
        Target date
        <input
          className="opm-input mt-1"
          type="date"
          min={MIN_TASK_DATE}
          max={MAX_TASK_DATE}
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
          required
        />
      </label>
      <label className="text-sm font-medium text-[var(--text)]">
        Status
        <select
          className="opm-select mt-1"
          value={status}
          onChange={(event) => setStatus(event.target.value as MilestoneStatus)}
        >
          {MILESTONE_STATUSES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button className="opm-btn-primary" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="opm-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
