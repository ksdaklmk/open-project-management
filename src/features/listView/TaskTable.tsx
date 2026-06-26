import { STATUSES, type Status } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'
import { TaskRow } from './TaskRow'

export function TaskTable({ status, tasks, members, onSelect }: {
  status: Status; tasks: Task[]; members: Member[]; onSelect: (ref: string) => void
}) {
  const meta = STATUSES.find((s) => s.id === status)
  return (
    <section className="mb-4">
      <h3 className="text-sm font-medium mb-1" style={{ color: meta?.color }}>
        {meta?.label} <span className="text-[var(--muted)]">{tasks.length}</span>
      </h3>
      <table className="w-full text-sm">
        <tbody>
          {tasks.map((t) => <TaskRow key={t.id} task={t} members={members} onSelect={onSelect} />)}
        </tbody>
      </table>
    </section>
  )
}
