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
  if (!s) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{
        color: `color-mix(in oklab, ${s.color} 80%, var(--text))`,
        background: `color-mix(in oklab, ${s.color} 14%, var(--surface))`,
        border: `1px solid color-mix(in oklab, ${s.color} 24%, var(--surface))`,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          background: s.color,
          width: 6,
          height: 6,
          borderRadius: '50%',
          display: 'block',
          flexShrink: 0,
        }}
      />
      {s.label}
    </span>
  )
}

function TaskRef({ task }: { task: ActivityItem['task'] }) {
  if (!task) return <span className="text-[var(--muted)]">a task</span>
  return (
    <span>
      <span className="opm-task-ref">{task.ref}</span> {task.title}
    </span>
  )
}

export function ActivityRow({ item }: { item: ActivityItem }) {
  const name = item.actor?.name || 'Someone'
  const color = item.actor?.color || 'var(--muted)'

  return (
    <div className="opm-activity-row flex items-start gap-3 px-3 py-2.5">
      {/* Actor avatar — decorative; name is in the text */}
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[var(--surface)]"
        style={{ background: color }}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>

      {/* Sentence line + status chip row */}
      <div className="min-w-0 flex-1">
        <p className="opm-activity-copy text-sm text-[var(--text)]">
          <span className="font-semibold">{name}</span>
          {item.verb === 'moved' ? (
            <>
              <span className="text-[var(--muted)]"> moved </span>
              <TaskRef task={item.task} />
            </>
          ) : item.verb === 'commented' ? (
            <>
              <span className="text-[var(--muted)]"> commented on </span>
              <TaskRef task={item.task} />
            </>
          ) : item.verb === 'created' ? (
            <>
              <span className="text-[var(--muted)]"> created </span>
              <TaskRef task={item.task} />
            </>
          ) : item.verb === 'assigned' ? (
            <>
              <span className="text-[var(--muted)]"> changed the assignee for </span>
              <TaskRef task={item.task} />
            </>
          ) : item.verb === 'deleted' ? (
            <>
              <span className="text-[var(--muted)]"> deleted </span>
              <TaskRef task={item.task} />
            </>
          ) : (
            <span className="text-[var(--muted)]"> {item.verb}</span>
          )}
        </p>
        {item.verb === 'moved' && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <StatusChip status={item.from_status} />
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="shrink-0 text-[var(--faint)]"
            >
              <path
                d="M5 12h14M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <StatusChip status={item.to_status} />
          </div>
        )}
      </div>

      {/* Relative timestamp */}
      <time
        dateTime={item.created_at}
        title={new Date(item.created_at).toLocaleString()}
        className="mt-0.5 shrink-0 text-xs tabular-nums text-[var(--muted)]"
      >
        {relativeTime(item.created_at)}
      </time>
    </div>
  )
}
