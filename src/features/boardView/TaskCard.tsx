import { useState } from 'react'
import type { CSSProperties } from 'react'
import { TASK_TYPES, PRIORITIES, STATUSES, TAG_COLORS } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'

// Mirrors the shape geometry from TaskRow's shapeStyle for visual consistency.
function TypeMark({ typeId }: { typeId: string }) {
  const type = TASK_TYPES[typeId as keyof typeof TASK_TYPES]
  if (!type) return null
  const base: CSSProperties = { background: type.color, display: 'block', flexShrink: 0 }
  let style: CSSProperties
  switch (type.shape) {
    case 'circle':
      style = { ...base, width: 9, height: 9, borderRadius: '50%' }
      break
    case 'line':
      style = { ...base, width: 11, height: 3, borderRadius: 2, marginTop: 1 }
      break
    case 'triangle':
      style = { ...base, width: 11, height: 9, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }
      break
    default: // square / feature
      style = { ...base, width: 9, height: 9, borderRadius: 2 }
  }
  return (
    <span
      className="inline-flex h-4 w-4 items-center justify-center"
      role="img"
      aria-label={type.label}
      title={type.label}
    >
      <span style={style} />
    </span>
  )
}

export function TaskCard({
  task,
  members,
  onDragStart,
  onOpen,
  selected,
}: {
  task: Task
  members: Member[]
  onDragStart: (taskId: string) => void
  onOpen: (ref: string) => void
  selected?: boolean
}) {
  const [isDragging, setIsDragging] = useState(false)
  const priority = PRIORITIES.find((p) => p.id === task.priority)
  const status = STATUSES.find((s) => s.id === task.status)
  const assignee = members.find((m) => m.user_id === task.assignee_id)
  const tags = task.tags

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer?.setData('text/plain', task.id)
        onDragStart(task.id)
        setIsDragging(true)
      }}
      onDragEnd={() => setIsDragging(false)}
      data-selected={selected || undefined}
      className={`opm-board-card select-none rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] cursor-grab${isDragging ? ' is-dragging' : ''}`}
    >
      <button
        type="button"
        onClick={() => onOpen(task.ref)}
        aria-label={`Open ${task.ref}: ${task.title}. Status: ${status?.label ?? task.status}. Priority: ${priority?.label ?? task.priority}.`}
        className="opm-task-open block w-full cursor-grab p-3 text-left"
      >
        {/* Row 1: type mark · ref · (points right-aligned) */}
        <span className="flex items-center gap-1.5">
          <TypeMark typeId={task.type} />
          <span className="opm-task-ref">{task.ref}</span>
          {task.points != null && <span className="opm-points ml-auto">{task.points}</span>}
        </span>

        {/* Title — up to 2 lines */}
        <span className="opm-task-title mt-1.5 block line-clamp-2 text-[var(--text)]">
          {task.title}
        </span>

        {/* Row 3: priority chip · tags · assignee avatar */}
        {(priority || tags.length > 0 || assignee) && (
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            {priority && (
              <span
                className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium"
                style={{
                  color: `color-mix(in oklab, ${priority.color} 72%, var(--text))`,
                  background: `color-mix(in oklab, ${priority.color} 14%, var(--surface))`,
                  border: `1px solid color-mix(in oklab, ${priority.color} 28%, var(--surface))`,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    background: priority.color,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    display: 'block',
                    flexShrink: 0,
                  }}
                />
                {priority.label}
              </span>
            )}

            {tags.map((tg) => (
              <span
                key={tg}
                className="opm-tag"
                style={{ '--chip': TAG_COLORS[tg] ?? 'var(--faint)' } as CSSProperties}
              >
                {tg}
              </span>
            ))}

            {assignee && (
              <span
                className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase"
                style={{
                  background: `color-mix(in oklab, var(--primary) 18%, var(--surface))`,
                  color: 'var(--primary)',
                }}
                title={assignee.name}
                aria-label={`Assigned to ${assignee.name}`}
              >
                {assignee.name.charAt(0)}
              </span>
            )}
          </span>
        )}
      </button>
    </article>
  )
}
