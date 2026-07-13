import type { CSSProperties } from 'react'
import { STATUSES, PRIORITIES } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'

export type Patch = Partial<Pick<Task, 'status' | 'priority' | 'assignee_id'>>

const chipVars = (color?: string) => ({ '--chip': color }) as CSSProperties

function Caret() {
  return (
    <svg className="opm-caret" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M3 4.5 6 7.5 9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function StatusCell({ task, onChange }: { task: Task; onChange: (p: Patch) => void }) {
  const meta = STATUSES.find((s) => s.id === task.status)
  return (
    <span className="opm-field is-chip" style={chipVars(meta?.color)}>
      <span className="opm-field-dot" aria-hidden="true" />
      <select
        aria-label="Status"
        className="opm-select opm-chip"
        value={task.status}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange({ status: e.target.value as Task['status'] })}
      >
        {STATUSES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <Caret />
    </span>
  )
}

export function PriorityCell({ task, onChange }: { task: Task; onChange: (p: Patch) => void }) {
  const meta = PRIORITIES.find((p) => p.id === task.priority)
  return (
    <span className="opm-field is-chip" style={chipVars(meta?.color)}>
      <span className="opm-field-dot" aria-hidden="true" />
      <select
        aria-label="Priority"
        className="opm-select opm-chip"
        value={task.priority}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange({ priority: e.target.value as Task['priority'] })}
      >
        {PRIORITIES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <Caret />
    </span>
  )
}

export function AssigneeCell({
  task,
  members,
  onChange,
}: {
  task: Task
  members: Member[]
  onChange: (p: Patch) => void
}) {
  return (
    <span className="opm-field">
      <select
        aria-label="Assignee"
        className="opm-select"
        value={task.assignee_id ?? ''}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange({ assignee_id: e.target.value || null })}
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.name}
          </option>
        ))}
      </select>
      <Caret />
    </span>
  )
}
