import { STATUSES, type Status } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'
import { TaskCard } from './TaskCard'

export function BoardColumn({ status, tasks, members }: {
  status: Status; tasks: Task[]; members: Member[]
}) {
  const meta = STATUSES.find((s) => s.id === status)
  return (
    <section className="flex w-64 shrink-0 flex-col gap-2">
      <h3 className="px-1 text-sm font-medium" style={{ color: meta?.color }}>
        {meta?.label} <span className="text-[var(--muted)]">{tasks.length}</span>
      </h3>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => <TaskCard key={t.id} task={t} members={members} />)}
      </div>
    </section>
  )
}
