import type { CSSProperties } from 'react'
import { STATUSES, type Status } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'
import { TaskRow } from './TaskRow'
import type { Patch } from './cells'

const cssVars = (color?: string) => ({ '--chip': color }) as CSSProperties

export function TaskTable({ status, tasks, members, selectedRef, onSelect, onPatch }: {
  status: Status; tasks: Task[]; members: Member[]; selectedRef?: string | null
  onSelect: (ref: string) => void; onPatch: (id: string, p: Patch) => void
}) {
  const meta = STATUSES.find((s) => s.id === status)
  return (
    <section className="mb-6">
      <h2 className="mb-1.5 flex items-center gap-2 px-3 text-[13px] font-semibold tracking-tight text-[var(--text)]">
        <span className="opm-group-dot" style={cssVars(meta?.color)} aria-hidden="true" />
        <span>{meta?.label}</span>
        <span className="opm-count">{tasks.length}</span>
      </h2>
      <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
        <colgroup>
          <col style={{ width: 34 }} />
          <col style={{ width: 76 }} />
          <col />
          <col style={{ width: 132 }} />
          <col style={{ width: 116 }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 56 }} />
        </colgroup>
        <tbody>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} members={members}
              selected={t.ref === selectedRef} onSelect={onSelect} onPatch={onPatch} />
          ))}
        </tbody>
      </table>
    </section>
  )
}
