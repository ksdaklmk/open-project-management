import { useFilteredTasks } from '../../lib/hooks/useFilteredTasks'
import { useActiveWorkspace } from '../../lib/workspace'
import { useViewState } from '../../app/useViewState'
import { STATUSES } from '../../types/constants'
import { splitGantt, buildScale } from './timeScale'
import { addDays, isoLocal, parseDate, startOfWeek } from '../../lib/weeks'
import type { Task } from '../../data/tasksRepo'
import { LoadMoreButton } from '../../components/LoadMoreButton'
import { useMilestones } from '../../lib/hooks/useMilestones'
import { useTaskDependencyEdges } from '../../lib/hooks/useTaskDependencies'
import type { ProjectMilestone } from '../../data/milestonesRepo'
import type { TaskDependencyEdge } from '../../data/dependenciesRepo'
import { BlockedBadge } from '../../components/BlockedBadge'

const COLOR: Record<string, string> = Object.fromEntries(STATUSES.map((s) => [s.id, s.color]))
const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUSES.map((s) => [s.id, s.label]),
)
const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const LABEL_COL = 168
const GRID = `${LABEL_COL}px 1fr`
const GRIDLINE = 'color-mix(in oklab, var(--border) 75%, transparent)'

export function GanttView({ now = new Date() }: { now?: Date } = {}) {
  const { activeId, loading: wsLoading } = useActiveWorkspace()
  const windowStart = isoLocal(addDays(startOfWeek(now), -84))
  const windowEnd = isoLocal(addDays(startOfWeek(now), 364))
  const scheduledQ = useFilteredTasks(activeId ?? '', {
    sort: 'due',
    schedule: 'gantt',
    windowStart,
    windowEnd,
    limit: 500,
  })
  const unscheduledQ = useFilteredTasks(activeId ?? '', {
    sort: 'position',
    schedule: 'unscheduled',
    limit: 100,
  })
  const milestonesQ = useMilestones(activeId ?? '')
  const dependenciesQ = useTaskDependencyEdges(
    activeId ?? '',
    (scheduledQ.data ?? []).map((task) => task.id),
  )
  const { setTaskRef } = useViewState()

  if (
    wsLoading ||
    scheduledQ.isLoading ||
    unscheduledQ.isLoading ||
    milestonesQ.isLoading ||
    dependenciesQ.isLoading
  )
    return <GanttSkeleton />
  if (scheduledQ.error || unscheduledQ.error || milestonesQ.error || dependenciesQ.error)
    return (
      <GanttError
        onRetry={() => {
          void scheduledQ.refetch()
          void unscheduledQ.refetch()
          void milestonesQ.refetch()
          void dependenciesQ.refetch()
        }}
      />
    )

  const all = [...(scheduledQ.data ?? []), ...(unscheduledQ.data ?? [])]
  const milestones = (milestonesQ.data ?? []).filter(
    (milestone) => milestone.target_date >= windowStart && milestone.target_date <= windowEnd,
  )
  if (all.length === 0 && milestones.length === 0) return <GanttEmpty />

  const { scheduled, unscheduled } = splitGantt(all)
  const ordered = [...scheduled].sort((a, b) =>
    a.start_date! < b.start_date!
      ? -1
      : a.start_date! > b.start_date!
        ? 1
        : a.ref.localeCompare(b.ref),
  )

  return (
    <div>
      {ordered.length === 0 && milestones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--muted)]">
            No scheduled tasks yet. Add start and due dates to place a task on the timeline.
          </p>
        </div>
      ) : (
        <div
          role="region"
          aria-label="Gantt chart, horizontally scrollable"
          tabIndex={0}
          className="opm-chart-scroll"
        >
          <GanttChart
            ordered={ordered}
            milestones={milestones}
            dependencies={dependenciesQ.data ?? []}
            now={now}
            onOpen={setTaskRef}
          />
        </div>
      )}
      {unscheduled.length > 0 && (
        <div className="mt-7">
          <h2 className="opm-section-title mb-2 flex items-center gap-2 px-0.5 text-[var(--text)]">
            Unscheduled
            <span className="opm-count">{unscheduled.length}</span>
          </h2>
          <ul className="overflow-hidden rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] divide-y divide-[var(--border)]">
            {unscheduled.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTaskRef(t.ref)}
                  aria-label={`Open ${t.ref}: ${t.title}. Status: ${STATUS_LABEL[t.status] ?? t.status}.`}
                  className="opm-task-open opm-row flex w-full items-center gap-3 px-4 py-2.5 text-left"
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: COLOR[t.status] ?? 'var(--muted)' }}
                  />
                  <span className="opm-task-ref">{t.ref}</span>
                  <span className="flex-1 truncate text-sm text-[var(--text)]">{t.title}</span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {scheduledQ.hasNextPage && (
        <LoadMoreButton
          label="Load more scheduled tasks"
          pending={scheduledQ.isFetchingNextPage}
          onClick={() => void scheduledQ.fetchNextPage()}
        />
      )}
      {unscheduledQ.hasNextPage && (
        <LoadMoreButton
          label="Load more unscheduled tasks"
          pending={unscheduledQ.isFetchingNextPage}
          onClick={() => void unscheduledQ.fetchNextPage()}
        />
      )}
    </div>
  )
}

function GanttChart({
  ordered,
  milestones,
  dependencies,
  now,
  onOpen,
}: {
  ordered: Task[]
  milestones: ProjectMilestone[]
  dependencies: TaskDependencyEdge[]
  now: Date
  onOpen: (ref: string) => void
}) {
  const scale = buildScale(
    ordered,
    now,
    milestones.map((milestone) => parseDate(milestone.target_date)),
  )
  const weekCount = scale.weeks.length
  const milestoneLaneHeight = milestones.length ? 44 : 0

  return (
    <div className="opm-chart-panel min-w-[720px] border border-[var(--border)] bg-[var(--surface)] p-4">
      {/* Week axis */}
      <div
        className="grid border-b border-[var(--border)] pb-2"
        style={{ gridTemplateColumns: GRID }}
      >
        <div />
        <div className="relative h-4 text-xs font-medium text-[var(--muted)]">
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
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0"
          style={{ left: LABEL_COL, right: 0 }}
        >
          {scale.weeks.map((_, i) => (
            <span
              key={i}
              className="absolute inset-y-0 w-px"
              style={{ left: `${(i / weekCount) * 100}%`, background: GRIDLINE }}
            />
          ))}
        </div>

        {milestones.length > 0 && (
          <div
            className="grid border-b border-[var(--border)]"
            style={{ gridTemplateColumns: GRID }}
          >
            <span className="self-center pr-3 text-xs font-medium text-[var(--muted)]">
              Milestones
            </span>
            <span className="relative block h-11">
              {milestones.map((milestone) => {
                const { leftPct } = scale.position(
                  parseDate(milestone.target_date),
                  parseDate(milestone.target_date),
                )
                const color =
                  milestone.status === 'complete'
                    ? 'var(--success)'
                    : milestone.status === 'at_risk'
                      ? 'var(--danger)'
                      : 'var(--primary)'
                return (
                  <span
                    key={milestone.id}
                    role="img"
                    aria-label={`${milestone.title}, ${milestone.projectName}, ${milestone.target_date}, ${milestone.status.replace('_', ' ')}`}
                    title={`${milestone.title} · ${milestone.projectName} · ${milestone.target_date}`}
                    className="absolute top-1 flex max-w-24 -translate-x-1/2 flex-col items-center"
                    style={{ left: `${leftPct}%`, color }}
                  >
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 rotate-45 border border-[var(--surface)]"
                      style={{ background: color }}
                    />
                    <span className="mt-0.5 block max-w-24 truncate text-[10px]">
                      {milestone.title}
                    </span>
                  </span>
                )
              })}
            </span>
          </div>
        )}

        <DependencyLines
          ordered={ordered}
          dependencies={dependencies}
          scale={scale}
          top={milestoneLaneHeight}
        />

        {ordered.map((t) => {
          const { leftPct, widthPct } = scale.position(
            parseDate(t.start_date!),
            parseDate(t.end_date!),
          )
          return (
            <button
              type="button"
              key={t.id}
              onClick={() => onOpen(t.ref)}
              aria-label={`Open ${t.ref}: ${t.title}. Status: ${STATUS_LABEL[t.status] ?? t.status}. ${fmt(parseDate(t.start_date!))} to ${fmt(parseDate(t.end_date!))}.`}
              className="opm-task-open opm-row grid w-full items-center text-left"
              style={{ gridTemplateColumns: GRID, height: 34 }}
            >
              <span className="block min-w-0 pr-3 leading-tight">
                <span className="flex min-w-0 items-center gap-1 text-xs text-[var(--muted)]">
                  <span className="shrink-0 font-medium tabular-nums">{t.ref}</span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{STATUS_LABEL[t.status] ?? t.status}</span>
                  <BlockedBadge count={t.blocked_by_count} compact />
                </span>
                <span className="block truncate text-xs text-[var(--text)]">{t.title}</span>
              </span>
              <span className="relative block h-full">
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 h-[18px] -translate-y-1/2 rounded-md"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    minWidth: 6,
                    background: COLOR[t.status] ?? 'var(--muted)',
                  }}
                />
              </span>
            </button>
          )
        })}

        {/* Today marker — drawn above bars */}
        {scale.todayPct !== null && (
          <div
            data-testid="gantt-today"
            className="pointer-events-none absolute top-0 bottom-0 w-px"
            style={{
              zIndex: 'var(--layer-dropdown)',
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

function DependencyLines({
  ordered,
  dependencies,
  scale,
  top,
}: {
  ordered: Task[]
  dependencies: TaskDependencyEdge[]
  scale: ReturnType<typeof buildScale>
  top: number
}) {
  const rows = new Map(ordered.map((task, index) => [task.id, { task, index }]))
  const visible = dependencies.flatMap((dependency) => {
    const predecessor = rows.get(dependency.predecessor.id)
    const successor = rows.get(dependency.successor.id)
    if (!predecessor || !successor) return []
    const predecessorBar = scale.position(
      parseDate(predecessor.task.start_date!),
      parseDate(predecessor.task.end_date!),
    )
    const successorBar = scale.position(
      parseDate(successor.task.start_date!),
      parseDate(successor.task.end_date!),
    )
    return [
      {
        id: dependency.id,
        x1: predecessorBar.leftPct + predecessorBar.widthPct,
        y1: predecessor.index * 34 + 17,
        x2: successorBar.leftPct,
        y2: successor.index * 34 + 17,
      },
    ]
  })
  if (visible.length === 0) return null
  return (
    <svg
      data-testid="gantt-dependencies"
      aria-hidden="true"
      className="pointer-events-none absolute right-0"
      style={{ left: LABEL_COL, top, height: Math.max(ordered.length * 34, 1) }}
      viewBox={`0 0 100 ${Math.max(ordered.length * 34, 1)}`}
      preserveAspectRatio="none"
    >
      <defs>
        <marker
          id="gantt-dependency-arrow"
          viewBox="0 0 6 6"
          refX="5"
          refY="3"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 6 3 0 6Z" fill="var(--muted)" />
        </marker>
      </defs>
      {visible.map((line) => {
        const bend = (line.x1 + line.x2) / 2
        return (
          <path
            key={line.id}
            d={`M ${line.x1} ${line.y1} C ${bend} ${line.y1}, ${bend} ${line.y2}, ${line.x2} ${line.y2}`}
            fill="none"
            stroke="var(--muted)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
            markerEnd="url(#gantt-dependency-arrow)"
          />
        )
      })}
    </svg>
  )
}

function GanttSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="opm-chart-panel min-w-[720px] border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <span className="sr-only">Loading timeline…</span>
      <div
        className="grid border-b border-[var(--border)] pb-2"
        style={{ gridTemplateColumns: GRID }}
      >
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
          <div
            key={i}
            className="grid items-center"
            style={{ gridTemplateColumns: GRID, height: 34 }}
          >
            <div className="pr-3">
              <div className="opm-skel h-3 rounded" style={{ width: `${70 - i * 8}%` }} />
            </div>
            <div className="relative h-[18px]">
              <div
                className="opm-skel absolute h-[18px] rounded-md"
                style={{ left: b.left, width: b.width }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GanttError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="opm-state mx-auto flex max-w-4xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center"
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
      <button type="button" className="opm-btn mt-4" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}

function GanttEmpty() {
  return (
    <div className="opm-state mx-auto flex max-w-4xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
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
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">
        Create a task with dates to see it on the Gantt.
      </p>
    </div>
  )
}
