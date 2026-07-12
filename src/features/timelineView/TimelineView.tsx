import { useFilteredTasks } from '../../lib/hooks/useFilteredTasks'
import { useActiveWorkspace } from '../../lib/workspace'
import { useViewState } from '../../app/useViewState'
import { STATUSES } from '../../types/constants'
import { bucketTasks } from './buckets'
import { parseDate } from '../../lib/weeks'
import type { Task } from '../../data/tasksRepo'

const COLOR: Record<string, string> = Object.fromEntries(STATUSES.map((s) => [s.id, s.color]))
const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function range(t: Task): string {
  if (!t.start_date) return ''
  const start = fmt(parseDate(t.start_date))
  return t.end_date ? `${start} – ${fmt(parseDate(t.end_date))}` : `${start} →`
}

export function TimelineView({ now = new Date() }: { now?: Date } = {}) {
  const { activeId, loading: wsLoading } = useActiveWorkspace()
  const { data: tasks, isLoading, error } = useFilteredTasks(activeId ?? '')
  const { setTaskRef } = useViewState()

  if (wsLoading || isLoading) return <TimelineSkeleton />
  if (error) return <TimelineError />

  const all = tasks ?? []
  if (all.length === 0) return <TimelineEmpty />

  const buckets = bucketTasks(all, now).filter((b) => b.tasks.length > 0)

  return (
    <div className="space-y-7">
      {buckets.map((b) => (
        <section key={b.id}>
          <h2 className="mb-2 flex items-center gap-2 px-0.5 text-[13px] font-semibold tracking-tight text-[var(--text)]">
            {b.label}
            <span className="opm-count">{b.tasks.length}</span>
          </h2>
          <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] divide-y divide-[var(--border)]">
            {b.tasks.map((t) => (
              <li
                key={t.id}
                onClick={() => setTaskRef(t.ref)}
                className="opm-row flex items-center gap-3 px-4 py-3 cursor-pointer"
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: COLOR[t.status] ?? 'var(--muted)' }}
                />
                <span className="font-mono text-[11px] tracking-tight text-[var(--muted)]">
                  {t.ref}
                </span>
                <span className="flex-1 truncate text-sm text-[var(--text)]">{t.title}</span>
                {range(t) && (
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
                    {range(t)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function TimelineSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-7">
      <span className="sr-only">Loading timeline…</span>
      {[0, 1].map((s) => (
        <div key={s}>
          <div className="opm-skel mb-2 ml-0.5 h-3 w-24 rounded" />
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] divide-y divide-[var(--border)]">
            {['62%', '78%', '54%'].map((w, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="opm-skel h-2.5 w-2.5 shrink-0 rounded-full" />
                <div className="opm-skel h-3 w-12 shrink-0 rounded" />
                <div className="opm-skel h-3 rounded" style={{ width: w }} />
                <div className="opm-skel ml-auto h-2.5 w-16 shrink-0 rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function TimelineError() {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-2xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 8.5v4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="16.3" r="1.05" fill="currentColor" />
          <path
            d="M12 3.5 21 19.5H3L12 3.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="text-base font-semibold text-[var(--text)]">Couldn't load tasks.</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">
        Check your connection and try again.
      </p>
    </div>
  )
}

function TimelineEmpty() {
  return (
    <div className="mx-auto flex max-w-2xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect
            x="3.5"
            y="5"
            width="17"
            height="15.5"
            rx="2.2"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M8 3.5v3M16 3.5v3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className="text-base font-semibold text-[var(--text)]">No tasks yet</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">
        Create a task to see it on the Timeline.
      </p>
    </div>
  )
}
