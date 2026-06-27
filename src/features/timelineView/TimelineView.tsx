import { useTasks } from '../../lib/hooks/useTasks'
import { useActiveWorkspace } from '../../lib/workspace'
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
  const { data: tasks, isLoading, error } = useTasks(activeId ?? '')

  if (wsLoading || isLoading) return <TimelineSkeleton />
  if (error) return <TimelineError />

  const all = tasks ?? []
  if (all.length === 0) return <TimelineEmpty />

  const buckets = bucketTasks(all, now).filter((b) => b.tasks.length > 0)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {buckets.map((b) => (
        <section key={b.id}>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--primary)]">{b.label}</h2>
          <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] divide-y divide-[var(--border)]">
            {b.tasks.map((t) => (
              <li key={t.id} className="opm-row flex items-center gap-3 px-4 py-3">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR[t.status] ?? 'var(--muted)' }} />
                <span className="font-mono text-[11px] text-[var(--muted)]">{t.ref}</span>
                <span className="flex-1 truncate text-sm text-[var(--text)]">{t.title}</span>
                {range(t) && <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">{range(t)}</span>}
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
    <div role="status" aria-busy="true" className="mx-auto max-w-2xl space-y-3">
      <span className="sr-only">Loading timeline…</span>
      {[0, 1, 2].map((i) => <div key={i} className="opm-skel h-12 rounded-xl" />)}
    </div>
  )
}

function TimelineError() {
  return (
    <div role="alert" className="mx-auto flex max-w-2xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-base font-semibold text-[var(--text)]">Couldn't load tasks.</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Check your connection and try again.</p>
    </div>
  )
}

function TimelineEmpty() {
  return (
    <div className="mx-auto flex max-w-2xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-base font-semibold text-[var(--text)]">No tasks yet</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Create a task to see it on the Timeline.</p>
    </div>
  )
}
