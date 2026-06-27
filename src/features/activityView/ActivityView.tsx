import { useActivity } from '../../lib/hooks/useActivity'
import { useActiveWorkspace } from '../../lib/workspace'
import { ActivityRow } from './ActivityRow'

const SKEL_WIDTHS = ['68%', '55%', '72%', '60%']

export function ActivityView() {
  const { activeId, loading: wsLoading } = useActiveWorkspace()
  const { data: items, isLoading, error } = useActivity(activeId ?? '')

  if (wsLoading || isLoading) return <ActivitySkeleton />
  if (error) return <ActivityError />

  const feed = items ?? []
  if (feed.length === 0) return <ActivityEmpty />

  return (
    <ol
      aria-label="Activity feed"
      className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] divide-y divide-[var(--border)]"
    >
      {feed.map((item) => (
        <li key={item.id} className="opm-row">
          <ActivityRow item={item} />
        </li>
      ))}
    </ol>
  )
}

function ActivitySkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] divide-y divide-[var(--border)]"
    >
      <span className="sr-only">Loading activity…</span>
      {SKEL_WIDTHS.map((w, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="opm-skel h-8 w-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="opm-skel h-3 rounded" style={{ width: w }} />
            <div className="opm-skel h-2.5 w-20 rounded" />
          </div>
          <div className="opm-skel h-2.5 w-12 shrink-0 rounded" />
        </div>
      ))}
    </div>
  )
}

function ActivityError() {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-2xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 8.5v4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="16.3" r="1.05" fill="currentColor" />
          <path d="M12 3.5 21 19.5H3L12 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-base font-semibold text-[var(--text)]">Couldn't load activity.</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Check your connection and try again.</p>
    </div>
  )
}

function ActivityEmpty() {
  return (
    <div className="mx-auto flex max-w-2xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-base font-semibold text-[var(--text)]">No activity yet</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">
        Move a card on the Board to start the feed.
      </p>
    </div>
  )
}
