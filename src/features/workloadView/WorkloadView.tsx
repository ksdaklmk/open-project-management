import { useActiveWorkspace } from '../../lib/workspace'
import { useTasks } from '../../lib/hooks/useTasks'
import { useMembers } from '../../lib/hooks/useMembers'
import { buildWorkload, type Level } from './workload'

const LEVEL_HEX: Record<Level, string> = { none: '', under: '#2bb673', near: '#f5a623', over: '#e5484d' }

function tint(level: Level): string {
  const hex = LEVEL_HEX[level] ?? '' // guarded: unknown level → neutral
  return hex ? `color-mix(in oklab, ${hex} 18%, var(--surface))` : 'var(--surface)'
}

export function WorkloadView({ now = new Date() }: { now?: Date } = {}) {
  const { activeId, loading: wsLoading } = useActiveWorkspace()
  const tasksQ = useTasks(activeId ?? '')
  const membersQ = useMembers(activeId ?? '')

  if (wsLoading || tasksQ.isLoading || membersQ.isLoading) return <WorkloadSkeleton />
  if (tasksQ.error || membersQ.error) return <WorkloadError />

  const tasks = tasksQ.data ?? []
  const members = membersQ.data ?? []
  if (members.length === 0 || tasks.length === 0) return <WorkloadEmpty />

  const wl = buildWorkload(tasks, members, now)
  const notShown = wl.unscheduledPoints + wl.outOfRangePoints

  return (
    <div className="mx-auto max-w-4xl">
      <table className="w-full border-separate" style={{ tableLayout: 'fixed', borderSpacing: 5 }}>
        <thead>
          <tr>
            <th scope="col" className="w-40" />
            {wl.weeks.map((w) => (
              <th key={w.key} scope="col" className="text-center text-[11px] font-medium text-[var(--muted)]">
                {w.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {wl.rows.map((row) => (
            <tr key={row.id}>
              <th scope="row" className="text-left align-middle">
                <span className="block truncate text-sm text-[var(--text)]">{row.name}</span>
                <span className="block text-[11px] text-[var(--muted)]">
                  {row.capacity === null ? 'no capacity' : `cap ${row.capacity}/wk`}
                </span>
              </th>
              {row.cells.map((cell, i) => (
                <td key={wl.weeks[i].key} className="align-middle">
                  <div
                    className="flex h-9 items-center justify-center gap-0.5 rounded-md text-[13px] font-semibold text-[var(--text)]"
                    style={{ background: tint(cell.level) }}
                  >
                    {cell.points === 0 ? (
                      <span className="text-[var(--muted)]">·</span>
                    ) : (
                      <span>{cell.points}</span>
                    )}
                    {cell.level === 'over' && <span aria-hidden="true">!</span>}
                    {cell.level === 'over' && <span className="sr-only"> over capacity</span>}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {notShown > 0 && (
        <p
          className="mt-3 px-1 text-[12px] text-[var(--muted)]"
          title={`${wl.unscheduledPoints} unscheduled · ${wl.outOfRangePoints} outside window`}
        >
          {notShown} {notShown === 1 ? 'point' : 'points'} not shown
        </p>
      )}
    </div>
  )
}

function WorkloadSkeleton() {
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-4xl space-y-2">
      <span className="sr-only">Loading workload…</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="opm-skel h-9 rounded-md" />
      ))}
    </div>
  )
}

function WorkloadError() {
  return (
    <div role="alert" className="mx-auto flex max-w-4xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-base font-semibold text-[var(--text)]">Couldn't load workload.</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Check your connection and try again.</p>
    </div>
  )
}

function WorkloadEmpty() {
  return (
    <div className="mx-auto flex max-w-4xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-base font-semibold text-[var(--text)]">Nothing to show yet</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Add tasks with points and assignees to see workload by week.</p>
    </div>
  )
}
