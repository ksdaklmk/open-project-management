import { useActivity } from '../../lib/hooks/useActivity'
import { useActiveWorkspace } from '../../lib/workspace'
import { ActivityRow } from './ActivityRow'

export function ActivityView() {
  const { activeId, loading: wsLoading } = useActiveWorkspace()
  const { data: items, isLoading, error } = useActivity(activeId ?? '')

  if (wsLoading || isLoading) return <ActivitySkeleton />
  if (error) return <ActivityError />

  const feed = items ?? []
  if (feed.length === 0) return <ActivityEmpty />

  return (
    <ol className="mx-auto flex max-w-2xl flex-col rounded-xl border border-[var(--border)] bg-[var(--bg)]">
      {feed.map((item) => (
        <li key={item.id}>
          <ActivityRow item={item} />
        </li>
      ))}
    </ol>
  )
}

function ActivitySkeleton() {
  return (
    <div role="status" aria-busy="true" className="mx-auto flex max-w-2xl flex-col gap-2">
      <span className="sr-only">Loading activity…</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <div className="opm-skel h-7 w-7 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="opm-skel h-3 w-2/3 rounded" />
            <div className="opm-skel h-3 w-24 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ActivityError() {
  return (
    <div
      role="alert"
      className="flex min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center"
    >
      <p className="text-base font-semibold text-[var(--text)]">Couldn't load activity.</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Check your connection and try again.</p>
    </div>
  )
}

function ActivityEmpty() {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-base font-semibold text-[var(--text)]">No activity yet</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">
        Move a card on the Board to start the feed.
      </p>
    </div>
  )
}
