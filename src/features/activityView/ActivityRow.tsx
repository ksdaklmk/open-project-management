import { STATUSES } from '../../types/constants'
import { relativeTime } from '../../lib/relativeTime'
import type { ActivityItem } from '../../data/activityRepo'
import type { Status } from '../../types/constants'

const STATUS_META = Object.fromEntries(STATUSES.map((s) => [s.id, s])) as Record<
  Status,
  (typeof STATUSES)[number]
>

function StatusChip({ status }: { status: Status | null }) {
  if (!status) return null
  const s = STATUS_META[status]
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
      style={{ background: `${s.color}1f`, color: s.color }}
    >
      {s.label}
    </span>
  )
}

export function ActivityRow({ item }: { item: ActivityItem }) {
  const name = item.actor?.name || 'Someone'
  const color = item.actor?.color || 'var(--muted)'

  return (
    <div className="flex items-start gap-3 border-b border-[var(--border)] px-3 py-3">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
        style={{ background: color }}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[var(--text)]">
          <span className="font-medium">{name}</span>
          {item.verb === 'moved' ? (
            <>
              <span className="text-[var(--muted)]"> moved </span>
              {item.task ? (
                <span>
                  <span className="text-[var(--muted)]">{item.task.ref}</span> {item.task.title}
                </span>
              ) : (
                <span className="text-[var(--muted)]">a task</span>
              )}
            </>
          ) : (
            <span className="text-[var(--muted)]"> {item.verb}</span>
          )}
        </p>
        {item.verb === 'moved' && (
          <div className="mt-1 flex items-center gap-1.5">
            <StatusChip status={item.from_status} />
            <span className="text-[var(--muted)]" aria-hidden="true">→</span>
            <StatusChip status={item.to_status} />
          </div>
        )}
      </div>
      <time
        dateTime={item.created_at}
        title={new Date(item.created_at).toLocaleString()}
        className="shrink-0 text-xs text-[var(--muted)]"
      >
        {relativeTime(item.created_at)}
      </time>
    </div>
  )
}
