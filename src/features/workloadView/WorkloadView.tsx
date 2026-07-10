import { useActiveWorkspace } from '../../lib/workspace'
import { useTasks } from '../../lib/hooks/useTasks'
import { useMembers } from '../../lib/hooks/useMembers'
import { buildWorkload, type Level } from './workload'

// Saturated load palette — used ONLY as the color-mix base for cell tints and as
// the saturated legend dots. Never a surface or text color. (none → neutral.)
const LEVEL_HEX: Record<Level, string> = { none: '', under: '#2bb673', near: '#f5a623', over: '#e5484d' }

// Per-level tint strength. Graduated so the alarm (over) reads loudest and a
// healthy load (under) stays calm. Scaled per theme via --load-boost so the
// tints survive the dark Slate surface without washing out (and stay quiet on
// the light Bloom surface).
const LEVEL_PCT: Record<Level, number> = { none: 0, under: 16, near: 22, over: 26 }

function tint(level: Level): string {
  const hex = LEVEL_HEX[level]
  const pct = LEVEL_PCT[level]
  if (!hex || !pct) return 'var(--surface)' // guarded: none / unknown level → neutral
  return `color-mix(in oklab, ${hex} calc(${pct}% * var(--load-boost, 1)), var(--surface))`
}

const LEGEND: { level: Exclude<Level, 'none'>; label: string }[] = [
  { level: 'under', label: 'Under' },
  { level: 'near', label: 'Near' },
  { level: 'over', label: 'Over' },
]

// Name column + 6 forward weeks. Mirrors the <table>'s w-40 label column.
const GRID_COLS = '10rem repeat(6, minmax(0, 1fr))'

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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
      <table className="w-full border-separate" style={{ tableLayout: 'fixed', borderSpacing: 5 }}>
        <caption className="sr-only">Workload by week</caption>
        <thead>
          <tr>
            <th className="w-40">
              <span className="sr-only">Team member</span>
            </th>
            {wl.weeks.map((w) => (
              <th
                key={w.key}
                scope="col"
                className="pb-1 text-center text-[11px] font-medium tabular-nums text-[var(--muted)]"
              >
                {w.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {wl.rows.map((row) => (
            <tr key={row.id}>
              <th scope="row" className="pr-3 text-left align-middle">
                <span className="block truncate text-[13px] font-medium text-[var(--text)]">{row.name}</span>
                <span className="block text-[11px] tabular-nums text-[var(--muted)]">
                  {row.capacity === null ? 'no capacity' : `cap ${row.capacity}/wk`}
                </span>
              </th>
              {row.cells.map((cell, i) => (
                <td key={wl.weeks[i].key} className="align-middle">
                  <div
                    className="flex h-9 items-center justify-center gap-0.5 rounded-md text-[13px] font-semibold tabular-nums text-[var(--text)]"
                    style={{ background: tint(cell.level) }}
                  >
                    {cell.points === 0 ? (
                      <span aria-hidden="true" className="font-normal text-[var(--faint)]">
                        ·
                      </span>
                    ) : (
                      <span>{cell.points}</span>
                    )}
                    {cell.level === 'over' && (
                      <span aria-hidden="true" className="font-bold">
                        !
                      </span>
                    )}
                    {cell.level === 'over' && <span className="sr-only"> over capacity</span>}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--border)] pt-3">
        <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
          {LEGEND.map(({ level, label }) => (
            <li key={level} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: LEVEL_HEX[level] }}
              />
              {label}
            </li>
          ))}
        </ul>
        {notShown > 0 && (
          <p
            className="text-[11px] tabular-nums text-[var(--muted)]"
            title={`${wl.unscheduledPoints} unscheduled · ${wl.outOfRangePoints} outside window`}
          >
            {notShown} {notShown === 1 ? 'point' : 'points'} not shown
          </p>
        )}
      </div>
    </div>
  )
}

function WorkloadSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4"
    >
      <span className="sr-only">Loading workload…</span>
      <div className="grid items-end" style={{ gridTemplateColumns: GRID_COLS, gap: 5 }}>
        <div />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="opm-skel mx-auto h-2.5 w-10 rounded" />
        ))}
      </div>
      <div className="mt-2.5 space-y-[5px]">
        {[0, 1, 2, 3].map((r) => (
          <div key={r} className="grid items-center" style={{ gridTemplateColumns: GRID_COLS, gap: 5 }}>
            <div className="space-y-1.5 pr-3">
              <div className="opm-skel h-3 rounded" style={{ width: `${66 - r * 7}%` }} />
              <div className="opm-skel h-2 w-14 rounded" />
            </div>
            {[0, 1, 2, 3, 4, 5].map((c) => (
              <div key={c} className="opm-skel h-9 rounded-md" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function WorkloadError() {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-4xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 8.5v4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="16.3" r="1.05" fill="currentColor" />
          <path d="M12 3.5 21 19.5H3L12 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-base font-semibold text-[var(--text)]">Couldn't load workload.</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Check your connection and try again.</p>
    </div>
  )
}

function WorkloadEmpty() {
  return (
    <div className="mx-auto flex max-w-4xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 19.5h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path
            d="M7.5 19.5V13M12 19.5V7.5M16.5 19.5V11"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className="text-base font-semibold text-[var(--text)]">Nothing to show yet</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">
        Add tasks with points and assignees to see workload by week.
      </p>
    </div>
  )
}
