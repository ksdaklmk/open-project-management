import { useState } from 'react'
import { STATUSES, type Status } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'
import { TaskCard } from './TaskCard'

export function BoardColumn({ status, tasks, members, onCardDragStart, onDrop }: {
  status: Status
  tasks: Task[]
  members: Member[]
  onCardDragStart: (taskId: string) => void
  onDrop: (status: Status, insertIndex: number) => void
}) {
  const meta = STATUSES.find((s) => s.id === status)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  return (
    <section
      className="flex w-64 shrink-0 flex-col gap-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDrop(status, hoverIndex ?? tasks.length)
        setHoverIndex(null)
      }}
    >
      <h3 className="px-1 text-sm font-medium" style={{ color: meta?.color }}>
        {meta?.label} <span className="text-[var(--muted)]">{tasks.length}</span>
      </h3>
      <div className="flex flex-col gap-2">
        {tasks.map((t, i) => (
          <div
            key={t.id}
            onDragOver={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setHoverIndex(e.clientY < r.top + r.height / 2 ? i : i + 1)
            }}
          >
            <TaskCard task={t} members={members} onDragStart={onCardDragStart} />
          </div>
        ))}
      </div>
    </section>
  )
}
