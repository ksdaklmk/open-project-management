import type { CSSProperties } from 'react'
import { STATUSES, type Status } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'
import { TaskRow } from './TaskRow'
import type { Patch } from './cells'

const cssVars = (color?: string) => ({ '--chip': color }) as CSSProperties

export function TaskTable({
  status,
  tasks,
  members,
  selectedRef,
  onSelect,
  onPatch,
  onMove,
}: {
  status: Status
  tasks: Task[]
  members: Member[]
  selectedRef?: string | null
  onSelect: (ref: string) => void
  onPatch: (id: string, p: Patch) => void
  onMove: (task: Task, toStatus: Task['status']) => void
}) {
  const meta = STATUSES.find((s) => s.id === status)
  return (
    <section className="opm-task-group mb-6">
      <h2 className="opm-section-title mb-1.5 flex items-center gap-2 px-3 text-[var(--text)]">
        <span className="opm-group-dot" style={cssVars(meta?.color)} aria-hidden="true" />
        <span>{meta?.label}</span>
        <span className="opm-count">{tasks.length}</span>
      </h2>
      <table className="opm-data-table w-full min-w-[940px] table-fixed border-collapse">
        <caption className="sr-only">{meta?.label} tasks</caption>
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
        <thead className="opm-table-head">
          <tr>
            <th scope="col">
              <span className="sr-only">Type</span>
            </th>
            <th scope="col">Key</th>
            <th scope="col">Task</th>
            <th scope="col">Status</th>
            <th scope="col">Priority</th>
            <th scope="col">Assignee</th>
            <th scope="col">Tags</th>
            <th scope="col" className="text-right">
              Points
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              members={members}
              selected={t.ref === selectedRef}
              onSelect={onSelect}
              onPatch={onPatch}
              onMove={onMove}
            />
          ))}
        </tbody>
      </table>
    </section>
  )
}
