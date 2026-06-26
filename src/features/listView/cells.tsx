import { STATUSES, PRIORITIES } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'

type Patch = Partial<Pick<Task, 'status' | 'priority' | 'assignee_id'>>
const sel = 'rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-1 py-0.5'

export function StatusCell({ task, onChange }: { task: Task; onChange: (p: Patch) => void }) {
  return (
    <select aria-label="Status" className={sel} value={task.status}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange({ status: e.target.value as Task['status'] })}>
      {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
    </select>
  )
}

export function PriorityCell({ task, onChange }: { task: Task; onChange: (p: Patch) => void }) {
  return (
    <select aria-label="Priority" className={sel} value={task.priority}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange({ priority: e.target.value as Task['priority'] })}>
      {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  )
}

export function AssigneeCell({ task, members, onChange }: {
  task: Task; members: Member[]; onChange: (p: Patch) => void
}) {
  return (
    <select aria-label="Assignee" className={sel} value={task.assignee_id ?? ''}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange({ assignee_id: e.target.value || null })}>
      <option value="">Unassigned</option>
      {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
    </select>
  )
}
