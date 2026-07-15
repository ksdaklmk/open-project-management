import { useMemo, useState } from 'react'
import type { TaskDependency, DependencyTask } from '../../data/dependenciesRepo'
import type { Task } from '../../data/tasksRepo'
import {
  useDependencyCandidates,
  useTaskDependencies,
  useTaskDependencyMutations,
} from '../../lib/hooks/useTaskDependencies'
import { BlockedBadge } from '../../components/BlockedBadge'

export function hasScheduleConflict(predecessor: DependencyTask, successor: DependencyTask) {
  return Boolean(
    predecessor.endDate && successor.startDate && successor.startDate < predecessor.endDate,
  )
}

export function DependencyPanel({ task, workspaceId }: { task: Task; workspaceId: string }) {
  const [candidateSearch, setCandidateSearch] = useState('')
  const dependencies = useTaskDependencies(workspaceId, task.id)
  const candidates = useDependencyCandidates(workspaceId, candidateSearch)
  const mutations = useTaskDependencyMutations(workspaceId)
  const [predecessorId, setPredecessorId] = useState('')
  const edges = dependencies.data ?? []
  const predecessors = edges.filter((edge) => edge.successor.id === task.id)
  const successors = edges.filter((edge) => edge.predecessor.id === task.id)
  const existingPredecessorIds = useMemo(
    () => new Set(predecessors.map((edge) => edge.predecessor.id)),
    [predecessors],
  )
  const options = (candidates.data ?? []).filter(
    (candidate) => candidate.id !== task.id && !existingPredecessorIds.has(candidate.id),
  )
  const blockedCount = predecessors.filter((edge) => edge.predecessor.status !== 'done').length

  return (
    <section aria-labelledby="dependency-title" className="border-t border-[var(--border)] pt-6">
      <div className="flex items-center gap-2">
        <h3 id="dependency-title" className="font-semibold text-[var(--text)]">
          Dependencies
        </h3>
        <BlockedBadge count={blockedCount} compact />
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Link prerequisite work. Dates are never moved automatically.
      </p>

      <form
        className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault()
          if (!predecessorId) return
          mutations.create.mutate(
            { predecessorTaskId: predecessorId, successorTaskId: task.id },
            { onSuccess: () => setPredecessorId('') },
          )
        }}
      >
        <label className="text-sm font-medium text-[var(--text)]">
          Find blocker
          <input
            className="opm-input mt-1"
            value={candidateSearch}
            placeholder="Search by title or description"
            onChange={(event) => setCandidateSearch(event.target.value)}
          />
        </label>
        <label className="min-w-0 flex-1 text-sm font-medium text-[var(--text)]">
          Add blocker
          <select
            className="opm-select mt-1"
            value={predecessorId}
            onChange={(event) => setPredecessorId(event.target.value)}
            disabled={candidates.isLoading}
          >
            <option value="">Select a task…</option>
            {options.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.ref} — {candidate.title}
              </option>
            ))}
          </select>
        </label>
        <button className="opm-btn" disabled={!predecessorId || mutations.create.isPending}>
          {mutations.create.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      {dependencies.isLoading ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Loading dependencies…</p>
      ) : dependencies.error ? (
        <div className="mt-3" role="alert">
          <p className="text-sm">Couldn’t load dependencies.</p>
          <button className="opm-btn mt-2" onClick={() => dependencies.refetch()}>
            Retry
          </button>
        </div>
      ) : edges.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">No dependencies yet.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <DependencyList
            title="Blocked by"
            taskId={task.id}
            edges={predecessors}
            other={(edge) => edge.predecessor}
            remove={(id) => mutations.remove.mutate(id)}
            removing={mutations.remove.isPending}
          />
          <DependencyList
            title="Blocking"
            taskId={task.id}
            edges={successors}
            other={(edge) => edge.successor}
            remove={(id) => mutations.remove.mutate(id)}
            removing={mutations.remove.isPending}
          />
        </div>
      )}
    </section>
  )
}

function DependencyList({
  title,
  taskId,
  edges,
  other,
  remove,
  removing,
}: {
  title: string
  taskId: string
  edges: TaskDependency[]
  other: (edge: TaskDependency) => DependencyTask
  remove: (id: string) => void
  removing: boolean
}) {
  if (edges.length === 0) return null
  return (
    <div>
      <h4 className="opm-field-label mb-1">{title}</h4>
      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {edges.map((edge) => {
          const linked = other(edge)
          const conflict = hasScheduleConflict(edge.predecessor, edge.successor)
          return (
            <li key={edge.id} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="opm-task-ref">{linked.ref}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">
                  {linked.title}
                </span>
                {title === 'Blocked by' && linked.status !== 'done' && (
                  <BlockedBadge count={1} compact />
                )}
                <button
                  type="button"
                  className="opm-btn"
                  disabled={removing}
                  aria-label={`Remove dependency with ${linked.ref}`}
                  onClick={() => remove(edge.id)}
                >
                  Remove
                </button>
              </div>
              {conflict && (
                <p role="status" className="mt-1 text-xs text-[var(--danger)]">
                  Schedule warning: {edge.successor.ref} starts before {edge.predecessor.ref}{' '}
                  finishes. Adjust dates manually if needed.
                </p>
              )}
              <span className="sr-only">Current task {taskId}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
