import { useState } from 'react'
import type { CSSProperties } from 'react'
import { STATUSES, type Status } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'
import { TaskCard } from './TaskCard'

const cssVars = (color?: string) => ({ '--chip': color }) as CSSProperties

function DropIndicator() {
  return <div aria-hidden="true" className="opm-drop-line" />
}

export function BoardColumn({
  status,
  tasks,
  members,
  onCardDragStart,
  onDrop,
  onOpen,
  selectedRef,
}: {
  status: Status
  tasks: Task[]
  members: Member[]
  onCardDragStart: (taskId: string) => void
  onDrop: (status: Status, insertIndex: number) => void
  onOpen: (ref: string) => void
  selectedRef?: string | null
}) {
  const meta = STATUSES.find((s) => s.id === status)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const isDragOver = hoverIndex !== null

  return (
    <section
      className={`opm-board-col flex w-64 shrink-0 flex-col rounded-md border border-[var(--border)] bg-[var(--canvas)]${isDragOver ? ' is-drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        // For empty columns there are no card wrappers to track position,
        // so we register a hover at index 0 directly on the column.
        if (tasks.length === 0) setHoverIndex(0)
      }}
      onDragLeave={(e) => {
        // Only clear when the cursor truly leaves the column (not just moves between children).
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setHoverIndex(null)
        }
      }}
      onDragEnd={() => setHoverIndex(null)}
      onDrop={(e) => {
        e.preventDefault()
        onDrop(status, hoverIndex ?? tasks.length)
        setHoverIndex(null)
      }}
    >
      {/* Column header: status dot · label · count */}
      <h2 className="opm-section-title flex items-center gap-2 px-3 py-2.5 text-[var(--text)]">
        <span className="opm-group-dot" style={cssVars(meta?.color)} aria-hidden="true" />
        <span>{meta?.label}</span>
        <span className="opm-count">{tasks.length}</span>
      </h2>

      {/* Divider */}
      <div className="mx-3 h-px bg-[var(--border)]" aria-hidden="true" />

      {/* Cards area */}
      <div className="flex flex-1 flex-col gap-1 p-2">
        {tasks.length === 0 ? (
          /* Empty column — serves as a visible drop target */
          <div
            className={`flex min-h-[80px] items-center justify-center rounded-lg text-xs transition-colors duration-100 ${
              isDragOver
                ? 'border border-dashed border-[var(--primary)] text-[var(--primary)]'
                : 'border border-dashed border-[var(--border)] text-[var(--muted)]'
            }`}
          >
            {isDragOver ? 'Drop here' : 'No tasks'}
          </div>
        ) : (
          <>
            {/* Indicator before first card */}
            {hoverIndex === 0 && <DropIndicator />}

            {tasks.map((t, i) => (
              <div
                key={t.id}
                onDragOver={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setHoverIndex(e.clientY < r.top + r.height / 2 ? i : i + 1)
                }}
              >
                <TaskCard
                  task={t}
                  members={members}
                  onDragStart={onCardDragStart}
                  onOpen={onOpen}
                  selected={t.ref === selectedRef}
                />
                {/* Indicator after this card */}
                {hoverIndex === i + 1 && <DropIndicator />}
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  )
}
