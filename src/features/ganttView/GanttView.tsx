import { useFilteredTasks } from '../../lib/hooks/useFilteredTasks'
import { useActiveWorkspace } from '../../lib/workspace'
import { useViewState } from '../../app/useViewState'
import { STATUSES } from '../../types/constants'
import { splitGantt, buildScale } from './timeScale'
import { parseDate } from '../../lib/weeks'
import type { Task } from '../../data/tasksRepo'

const COLOR: Record<string, string> = Object.fromEntries(STATUSES.map((s) => [s.id, s.color]))
const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const LABEL_COL = 168
const GRID = `${LABEL_COL}px 1fr`
const GRIDLINE = 'color-mix(in oklab, var(--border) 75%, transparent)'
const BAR_SHADOW = '0 1px 2px color-mix(in oklab, var(--text) 14%, transparent)'

export function GanttView({ now = new Date() }: { now?: Date } = {}) {
  const { activeId, loading: wsLoading } = useActiveWorkspace()
  const { data: tasks, isLoading, error } = useFilteredTasks(activeId ?? '')
  const { setTaskRef } = useViewState()

  if (wsLoading || isLoading) return <GanttSkeleton />
  if (error) return <GanttError />

  const all = tasks ?? []
  if (all.length === 0) return <GanttEmpty />

  const { scheduled, unscheduled } = splitGantt(all)
  const ordered = [...scheduled].sort((a, b) =>
    a.start_date! < b.start_date! ? -1 : a.start_date! > b.start_date! ? 1 : a.ref.localeCompare(b.ref),
  )

  return (
    <div className="mx-auto max-w-4xl">
      {ordered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--muted)]">
            No scheduled tasks yet. Add start and due dates to place a task on the timeline.
          </p>
        </div>
      ) : (
        <GanttChart ordered={ordered} now={now} onOpen={setTaskRef} />
      )}
      {unscheduled.length > 0 && (
        <div className="mt-7">
          <h2 className="mb-2 flex items-center gap-2 px-0.5 text-[13px] font-semibold tracking-tight text-[var(--text)]">
            Unscheduled
            <span className="opm-count">{unscheduled.length}</span>
          </h2>
          <ul className="overflow-hidden rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] divide-y divide-[var(--border)]">
            {unscheduled.map((t) => (
              <li key={t.id} onClick={() => setTaskRef(t.ref)} className="opm-row flex items-center gap-3 px-4 py-2.5 cursor-pointer">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: COLOR[t.status] ?? 'var(--muted)' }}
                />
                <span className="font-mono text-[11px] tracking-tight text-[var(--muted)]">{t.ref}</span>
                <span className="flex-1 truncate text-sm text-[var(--text)]">{t.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function GanttChart({ ordered, now, onOpen }: { ordered: Task[]; now: Date; onOpen: (ref: string) => void }) {
  const scale = buildScale(ordered, now)
  const weekCount = scale.weeks.length

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
      {/* Week axis */}
      <div className="grid border-b border-[var(--border)] pb-2" style={{ gridTemplateColumns: GRID }}>
        <div />
        <div className="relative h-4 text-[11px] font-medium text-[var(--muted)]">
          {scale.weeks.map((w, i) => (
            <span
              key={i}
              className="absolute top-0 whitespace-nowrap tabular-nums"
              style={{ left: `${(i / weekCount) * 100}%` }}
            >
              {w.label}
            </span>
          ))}
        </div>
      </div>

      {/* Plot */}
      <div className="relative">
        {/* Week gridlines — chart area only */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0" style={{ left: LABEL_COL, right: 0 }}>
          {scale.weeks.map((_, i) => (
            <span
              key={i}
              className="absolute inset-y-0 w-px"
              style={{ left: `${(i / weekCount) * 100}%`, background: GRIDLINE }}
            />
          ))}
        </div>

        {ordered.map((t) => {
          const { leftPct, widthPct } = scale.position(parseDate(t.start_date!), parseDate(t.end_date!))
          return (
            <div key={t.id} onClick={() => onOpen(t.ref)} className="opm-row grid items-center cursor-pointer" style={{ gridTemplateColumns: GRID, height: 34 }}>
              <div className="truncate pr-3">
                <span className="font-mono text-[10px] tracking-tight text-[var(--muted)]">{t.ref}</span>{' '}
                <span className="text-xs text-[var(--text)]">{t.title}</span>
              </div>
              <div className="relative h-full">
                <div
                  role="img"
                  aria-label={`${t.title} · ${fmt(parseDate(t.start_date!))} – ${fmt(parseDate(t.end_date!))}`}
                  className="absolute top-1/2 h-[18px] -translate-y-1/2 rounded-md"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    minWidth: 6,
                    background: COLOR[t.status] ?? 'var(--muted)',
                    boxShadow: BAR_SHADOW,
                  }}
                />
              </div>
            </div>
          )
        })}

        {/* Today marker — drawn above bars */}
        {scale.todayPct !== null && (
          <div
            data-testid="gantt-today"
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-px"
            style={{
              left: `calc(${LABEL_COL}px + (100% - ${LABEL_COL}px) * ${scale.todayPct / 100})`,
              background: 'var(--primary)',
            }}
          >
            <span
              className="absolute -top-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
              style={{ background: 'var(--primary)' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function GanttSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto max-w-4xl rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4"
    >
      <span className="sr-only">Loading timeline…</span>
      <div className="grid border-b border-[var(--border)] pb-2" style={{ gridTemplateColumns: GRID }}>
        <div />
        <div className="flex gap-10">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="opm-skel h-2.5 w-10 rounded" />
          ))}
        </div>
      </div>
      <div className="space-y-1 pt-2">
        {[
          { left: '4%', width: '34%' },
          { left: '22%', width: '40%' },
          { left: '50%', width: '28%' },
          { left: '12%', width: '46%' },
        ].map((b, i) => (
          <div key={i} className="grid items-center" style={{ gridTemplateColumns: GRID, height: 34 }}>
            <div className="pr-3">
              <div className="opm-skel h-3 rounded" style={{ width: `${70 - i * 8}%` }} />
            </div>
            <div className="relative h-[18px]">
              <div className="opm-skel absolute h-[18px] rounded-md" style={{ left: b.left, width: b.width }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GanttError() {
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
      <p className="text-base font-semibold text-[var(--text)]">Couldn't load tasks.</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Check your connection and try again.</p>
    </div>
  )
}

function GanttEmpty() {
  return (
    <div className="mx-auto flex max-w-4xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 7.5h10M4 12h13M4 16.5h7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className="text-base font-semibold text-[var(--text)]">No tasks yet</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Create a task with dates to see it on the Gantt.</p>
    </div>
  )
}
