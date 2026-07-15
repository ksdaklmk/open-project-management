import { useMemo, useState } from 'react'
import type { Member } from '../../data/membersRepo'
import type { ProjectOption } from '../../data/projectsRepo'
import type { Task } from '../../data/tasksRepo'
import { PRIORITIES, STATUSES, TAG_COLORS } from '../../types/constants'
import { MAX_TASK_DATE, MIN_TASK_DATE } from '../../lib/validation'
import { useBulkTasks, type BulkTaskAction } from '../../lib/hooks/useBulkTasks'

type ActionKind = BulkTaskAction['kind']

const ACTIONS: Array<{ id: ActionKind; label: string }> = [
  { id: 'status', label: 'Set status' },
  { id: 'priority', label: 'Set priority' },
  { id: 'assignee', label: 'Set assignee' },
  { id: 'start_date', label: 'Set / clear start date' },
  { id: 'end_date', label: 'Set / clear due date' },
  { id: 'clear_dates', label: 'Clear both dates' },
  { id: 'tag_add', label: 'Add tag' },
  { id: 'tag_remove', label: 'Remove tag' },
  { id: 'project', label: 'Move to project' },
  { id: 'archive', label: 'Archive' },
  { id: 'delete', label: 'Delete permanently' },
]

function defaultValue(kind: ActionKind, projects: ProjectOption[]) {
  if (kind === 'status') return 'todo'
  if (kind === 'priority') return 'medium'
  if (kind === 'tag_add' || kind === 'tag_remove') return Object.keys(TAG_COLORS)[0] ?? ''
  if (kind === 'project') return projects[0]?.id ?? ''
  return ''
}

function buildAction(kind: ActionKind, value: string): BulkTaskAction | null {
  if (kind === 'status') return { kind, value: value as Task['status'] }
  if (kind === 'priority') return { kind, value: value as Task['priority'] }
  if (kind === 'assignee') return { kind, value: value || null }
  if (kind === 'start_date' || kind === 'end_date') return { kind, value: value || null }
  if (kind === 'tag_add' || kind === 'tag_remove') return value ? { kind, value } : null
  if (kind === 'project') return value ? { kind, value } : null
  return { kind }
}

export function BulkActionBar({
  workspaceId,
  taskIds,
  members,
  projects,
  onClearSelection,
}: {
  workspaceId: string
  taskIds: string[]
  members: Member[]
  projects: ProjectOption[]
  onClearSelection: () => void
}) {
  const bulk = useBulkTasks(workspaceId)
  const [kind, setKind] = useState<ActionKind>('status')
  const [value, setValue] = useState('todo')
  const [reviewedSignature, setReviewedSignature] = useState('')
  const action = buildAction(kind, value)
  const selectionKey = useMemo(() => [...taskIds].sort().join(','), [taskIds])
  const actionKey = action ? JSON.stringify(action) : ''
  const signature = `${selectionKey}:${actionKey}`
  const preflight = reviewedSignature === signature ? bulk.preflight.data : null

  if (taskIds.length === 0 && !bulk.lastResult) return null

  const chooseKind = (next: ActionKind) => {
    setKind(next)
    setValue(defaultValue(next, projects))
    setReviewedSignature('')
    bulk.preflight.reset()
  }

  const chooseValue = (next: string) => {
    setValue(next)
    setReviewedSignature('')
    bulk.preflight.reset()
  }

  const review = () => {
    if (!action) return
    bulk.preflight.mutate({ taskIds, action }, { onSuccess: () => setReviewedSignature(signature) })
  }

  const apply = () => {
    if (!action || !preflight?.willChangeCount) return
    bulk.apply.mutate(
      { taskIds, action },
      {
        onSuccess: () => {
          setReviewedSignature('')
          onClearSelection()
        },
      },
    )
  }

  const result = bulk.lastResult
  const canUndo = !!result?.undoableUntil && result.changedCount > 0

  return (
    <section
      aria-label="Bulk task actions"
      className="sticky top-0 z-20 mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm"
    >
      {taskIds.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <p className="min-w-28 self-center text-sm font-semibold text-[var(--text)]">
            {taskIds.length} selected
          </p>
          <label>
            <span className="opm-field-label mb-1 block">Bulk action</span>
            <select
              aria-label="Bulk action"
              className="opm-select w-auto"
              value={kind}
              disabled={bulk.apply.isPending}
              onChange={(event) => chooseKind(event.target.value as ActionKind)}
            >
              {ACTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <ActionValue
            kind={kind}
            value={value}
            members={members}
            projects={projects}
            disabled={bulk.apply.isPending}
            onChange={chooseValue}
          />
          <button
            type="button"
            className="opm-btn"
            disabled={!action || bulk.preflight.isPending || bulk.apply.isPending}
            onClick={review}
          >
            {bulk.preflight.isPending ? 'Reviewing…' : 'Review'}
          </button>
          <button
            type="button"
            className={kind === 'delete' ? 'opm-btn-danger' : 'opm-btn-primary'}
            disabled={!preflight?.willChangeCount || bulk.apply.isPending}
            onClick={apply}
          >
            {kind === 'delete'
              ? `Delete ${preflight?.willChangeCount ?? 0} permanently`
              : `Apply to ${preflight?.willChangeCount ?? 0}`}
          </button>
          <button
            type="button"
            className="opm-btn"
            disabled={bulk.apply.isPending}
            onClick={onClearSelection}
          >
            Clear selection
          </button>
        </div>
      )}

      {preflight && (
        <p role="status" className="mt-2 text-sm text-[var(--muted)]">
          {preflight.willChangeCount} will change, {preflight.unchangedCount} already match,
          {` ${preflight.skippedCount} will be skipped.`}
          {kind === 'delete' && preflight.willChangeCount > 0
            ? ' Deleted tasks and their comments cannot be restored.'
            : ''}
        </p>
      )}

      {bulk.progress && (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="mb-1 flex justify-between text-xs text-[var(--muted)]">
            <span>Updating tasks…</span>
            <span>
              {bulk.progress.processedCount} / {bulk.progress.totalCount}
            </span>
          </div>
          <progress
            className="block h-2 w-full accent-[var(--primary)]"
            max={bulk.progress.totalCount}
            value={bulk.progress.processedCount}
          />
        </div>
      )}

      {result && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
          <p role="status" className="mr-auto text-sm text-[var(--text)]">
            {result.complete
              ? `${result.changedCount} changed, ${result.unchangedCount} unchanged, ${result.skippedCount} skipped.`
              : `${result.processedCount} processed; ${result.failedCount} not attempted after a batch failed.`}
          </p>
          {canUndo && (
            <button
              type="button"
              className="opm-btn"
              disabled={bulk.undo.isPending}
              onClick={() => bulk.undo.mutate(result.operationId)}
            >
              {bulk.undo.isPending ? 'Undoing…' : `Undo ${result.changedCount} changes`}
            </button>
          )}
          <button type="button" className="opm-btn" onClick={bulk.clearResult}>
            Dismiss
          </button>
        </div>
      )}
    </section>
  )
}

function ActionValue({
  kind,
  value,
  members,
  projects,
  disabled,
  onChange,
}: {
  kind: ActionKind
  value: string
  members: Member[]
  projects: ProjectOption[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  if (kind === 'clear_dates' || kind === 'archive' || kind === 'delete') return null
  if (kind === 'start_date' || kind === 'end_date') {
    return (
      <label>
        <span className="opm-field-label mb-1 block">
          {kind === 'start_date' ? 'Start date' : 'Due date'} (blank clears)
        </span>
        <input
          aria-label={kind === 'start_date' ? 'Bulk start date' : 'Bulk due date'}
          className="opm-input"
          type="date"
          min={MIN_TASK_DATE}
          max={MAX_TASK_DATE}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    )
  }

  let options: Array<{ id: string; label: string }> = []
  if (kind === 'status')
    options = STATUSES.map((status) => ({ id: status.id, label: status.label }))
  else if (kind === 'priority')
    options = PRIORITIES.map((priority) => ({ id: priority.id, label: priority.label }))
  else if (kind === 'assignee')
    options = [
      { id: '', label: 'Unassigned' },
      ...members.map((member) => ({ id: member.user_id, label: member.name || 'Someone' })),
    ]
  else if (kind === 'tag_add' || kind === 'tag_remove')
    options = Object.keys(TAG_COLORS).map((tag) => ({ id: tag, label: tag }))
  else if (kind === 'project')
    options = projects.map((project) => ({
      id: project.id,
      label: `${project.key} — ${project.name}`,
    }))

  return (
    <label>
      <span className="opm-field-label mb-1 block">Value</span>
      <select
        aria-label="Bulk action value"
        className="opm-select w-auto"
        value={value}
        disabled={disabled || options.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.id || 'none'} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
