import { TASK_TYPES, STATUSES, PRIORITIES, TAG_COLORS } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'

const label = <T extends { id: string; label: string; color: string }>(arr: readonly T[], id: string) =>
  arr.find((x) => x.id === id)

export function TaskRow({ task, members, onSelect }: {
  task: Task; members: Member[]; onSelect: (ref: string) => void
}) {
  const type = TASK_TYPES[task.type]
  const status = label(STATUSES, task.status)
  const priority = label(PRIORITIES, task.priority)
  const assignee = members.find((m) => m.user_id === task.assignee_id)
  return (
    <tr onClick={() => onSelect(task.ref)}
      className="border-b border-[var(--border)] hover:bg-[var(--surface)] cursor-pointer">
      <td className="px-2 py-1"><span style={{ color: type.color }}>{type.label[0]}</span></td>
      <td className="px-2 py-1 text-[var(--muted)]">{task.ref}</td>
      <td className="px-2 py-1 text-[var(--text)]">{task.title}</td>
      <td className="px-2 py-1"><span style={{ color: status?.color }}>{status?.label}</span></td>
      <td className="px-2 py-1"><span style={{ color: priority?.color }}>{priority?.label}</span></td>
      <td className="px-2 py-1 text-[var(--text)]">{assignee?.name ?? '—'}</td>
      <td className="px-2 py-1">{(task as Task & { tags?: string[] }).tags?.map?.((tg) => (
        <span key={tg} style={{ color: TAG_COLORS[tg] }} className="mr-1">{tg}</span>
      ))}</td>
      <td className="px-2 py-1 text-[var(--muted)]">{task.points ?? ''}</td>
    </tr>
  )
}
