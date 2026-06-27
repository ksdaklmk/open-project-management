import { useTasks } from '../../lib/hooks/useTasks'
import { useActiveWorkspace } from '../../lib/workspace'
import { STATUSES } from '../../types/constants'
import { splitGantt, buildScale } from './timeScale'
import { parseDate } from '../../lib/weeks'
import type { Task } from '../../data/tasksRepo'

const COLOR: Record<string, string> = Object.fromEntries(STATUSES.map((s) => [s.id, s.color]))
const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const LABEL_COL = 160

export function GanttView({ now = new Date() }: { now?: Date } = {}) {
  const { activeId, loading: wsLoading } = useActiveWorkspace()
  const { data: tasks, isLoading, error } = useTasks(activeId ?? '')

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
        <p className="mb-6 text-sm text-[var(--muted)]">No scheduled tasks yet — add start and due dates to place them on the timeline.</p>
      ) : (
        <GanttChart ordered={ordered} now={now} />
      )}
      {unscheduled.length > 0 && (
        <div className="mt-6 border-t border-dashed border-[var(--border)] pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">⊘ Unscheduled — {unscheduled.length}</p>
          <ul className="mt-2 space-y-1">
            {unscheduled.map((t) => (
              <li key={t.id} className="text-sm text-[var(--text)]">
                <span className="font-mono text-[11px] text-[var(--muted)]">{t.ref}</span> {t.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function GanttChart({ ordered, now }: { ordered: Task[]; now: Date }) {
  const scale = buildScale(ordered, now)
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="grid" style={{ gridTemplateColumns: `${LABEL_COL}px 1fr` }}>
        <div />
        <div className="relative h-5 text-[11px] text-[var(--muted)]">
          {scale.weeks.map((w, i) => (
            <span key={i} className="absolute" style={{ left: `${(i / scale.weeks.length) * 100}%` }}>{w.label}</span>
          ))}
        </div>
      </div>
      <div className="relative">
        {scale.todayPct !== null && (
          <div
            data-testid="gantt-today"
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-[var(--primary)]"
            style={{ left: `calc(${LABEL_COL}px + (100% - ${LABEL_COL}px) * ${scale.todayPct / 100})` }}
          />
        )}
        {ordered.map((t) => {
          const { leftPct, widthPct } = scale.position(parseDate(t.start_date!), parseDate(t.end_date!))
          return (
            <div key={t.id} className="grid items-center" style={{ gridTemplateColumns: `${LABEL_COL}px 1fr`, height: 30 }}>
              <div className="truncate pr-3 text-xs text-[var(--text)]">
                <span className="font-mono text-[10px] text-[var(--muted)]">{t.ref}</span> {t.title}
              </div>
              <div className="relative h-5">
                <div
                  role="img"
                  aria-label={`${t.title} · ${fmt(parseDate(t.start_date!))} – ${fmt(parseDate(t.end_date!))}`}
                  className="absolute top-0.5 h-4 rounded"
                  style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: 6, background: COLOR[t.status] ?? 'var(--muted)' }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GanttSkeleton() {
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-4xl rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
      <span className="sr-only">Loading timeline…</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <div className="opm-skel h-3 w-32 rounded" />
          <div className="opm-skel h-4 flex-1 rounded" />
        </div>
      ))}
    </div>
  )
}

function GanttError() {
  return (
    <div role="alert" className="mx-auto flex max-w-4xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-base font-semibold text-[var(--text)]">Couldn't load tasks.</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Check your connection and try again.</p>
    </div>
  )
}

function GanttEmpty() {
  return (
    <div className="mx-auto flex max-w-4xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-base font-semibold text-[var(--text)]">No tasks yet</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Create a task with dates to see it on the Gantt.</p>
    </div>
  )
}
