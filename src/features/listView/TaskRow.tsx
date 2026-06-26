import { TASK_TYPES, TAG_COLORS } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'
import { StatusCell, PriorityCell, AssigneeCell } from './cells'

type Patch = Partial<Pick<Task, 'status' | 'priority' | 'assignee_id'>>

export function TaskRow({ task, members, onSelect, onPatch }: {
  task: Task; members: Member[]; onSelect: (ref: string) => void; onPatch: (id: string, p: Patch) => void
}) {
  const type = TASK_TYPES[task.type]
  return (
    <tr onClick={() => onSelect(task.ref)}
      className="border-b border-[var(--border)] hover:bg-[var(--surface)] cursor-pointer">
      <td className="px-2 py-1"><span style={{ color: type.color }}>{type.label[0]}</span></td>
      <td className="px-2 py-1 text-[var(--muted)]">{task.ref}</td>
      <td className="px-2 py-1 text-[var(--text)]">{task.title}</td>
      <td className="px-2 py-1"><StatusCell task={task} onChange={(p) => onPatch(task.id, p)} /></td>
      <td className="px-2 py-1"><PriorityCell task={task} onChange={(p) => onPatch(task.id, p)} /></td>
      <td className="px-2 py-1"><AssigneeCell task={task} members={members} onChange={(p) => onPatch(task.id, p)} /></td>
      <td className="px-2 py-1">{(task as Task & { tags?: string[] }).tags?.map?.((tg) => (
        <span key={tg} style={{ color: TAG_COLORS[tg] }} className="mr-1">{tg}</span>
      ))}</td>
      <td className="px-2 py-1 text-[var(--muted)]">{task.points ?? ''}</td>
    </tr>
  )
}
