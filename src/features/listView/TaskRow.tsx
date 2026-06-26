import type { CSSProperties } from 'react'
import { TASK_TYPES, TAG_COLORS } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'
import { StatusCell, PriorityCell, AssigneeCell, type Patch } from './cells'

const cssVars = (color?: string) => ({ '--chip': color }) as CSSProperties

function shapeStyle(shape: string, color: string): CSSProperties {
  const base: CSSProperties = { background: color, display: 'block' }
  switch (shape) {
    case 'circle':   return { ...base, width: 9, height: 9, borderRadius: '50%' }
    case 'line':     return { ...base, width: 11, height: 3, borderRadius: 2 }
    case 'triangle': return { ...base, width: 11, height: 9, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }
    default:         return { ...base, width: 9, height: 9, borderRadius: 2 } // square (feature)
  }
}

export function TaskRow({ task, members, selected, onSelect, onPatch, onMove }: {
  task: Task; members: Member[]; selected?: boolean
  onSelect: (ref: string) => void; onPatch: (id: string, p: Patch) => void
  onMove: (task: Task, toStatus: Task['status']) => void
}) {
  const type = TASK_TYPES[task.type]
  const tags = (task as Task & { tags?: string[] }).tags
  return (
    <tr
      onClick={() => onSelect(task.ref)}
      aria-selected={selected || undefined}
      className="opm-row cursor-pointer border-b border-[var(--border)]"
    >
      <td className="py-1.5 pl-3 pr-1 align-middle">
        <span className="inline-flex h-4 w-4 items-center justify-center"
          role="img" aria-label={type.label} title={type.label}>
          <span style={shapeStyle(type.shape, type.color)} />
        </span>
      </td>
      <td className="px-2 py-1.5 align-middle">
        <span className="text-xs font-medium tabular-nums tracking-tight text-[var(--muted)]">{task.ref}</span>
      </td>
      <td className="px-2 py-1.5 align-middle">
        <span className="block truncate font-medium text-[var(--text)]">{task.title}</span>
      </td>
      <td className="px-2 py-1.5 align-middle">
        <StatusCell task={task} onChange={(p) => p.status && onMove(task, p.status)} />
      </td>
      <td className="px-2 py-1.5 align-middle">
        <PriorityCell task={task} onChange={(p) => onPatch(task.id, p)} />
      </td>
      <td className="px-2 py-1.5 align-middle">
        <AssigneeCell task={task} members={members} onChange={(p) => onPatch(task.id, p)} />
      </td>
      <td className="px-2 py-1.5 align-middle">
        {tags?.length ? (
          <div className="flex flex-wrap gap-1">
            {tags.map((tg) => (
              <span key={tg} className="opm-tag" style={cssVars(TAG_COLORS[tg] ?? 'var(--faint)')}>{tg}</span>
            ))}
          </div>
        ) : null}
      </td>
      <td className="py-1.5 pl-2 pr-3 text-right align-middle">
        {task.points != null ? <span className="opm-points">{task.points}</span> : null}
      </td>
    </tr>
  )
}
