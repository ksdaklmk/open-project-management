import { TASK_TYPES, PRIORITIES } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'

export function TaskCard({ task, members }: { task: Task; members: Member[] }) {
  const type = TASK_TYPES[task.type]
  const priority = PRIORITIES.find((p) => p.id === task.priority)
  const assignee = members.find((m) => m.user_id === task.assignee_id)
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[var(--text)]">
      <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <span style={{ color: type.color }}>{type.label[0]}</span>
        <span>{task.ref}</span>
        {task.points != null && <span className="ml-auto">{task.points}</span>}
      </div>
      <p className="mt-1 text-sm">{task.title}</p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span style={{ color: priority?.color }}>{priority?.label}</span>
        <span className="ml-auto text-[var(--muted)]">{assignee?.name ?? '—'}</span>
      </div>
    </article>
  )
}
