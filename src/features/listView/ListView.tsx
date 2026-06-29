import { useFilteredTasks } from '../../lib/hooks/useFilteredTasks'
import { useMembers } from '../../lib/hooks/useMembers'
import { useActiveWorkspace } from '../../lib/workspace'
import { useViewState } from '../../app/useViewState'
import { useUpdateTask } from '../../lib/hooks/useUpdateTask'
import { useMoveTask } from '../../lib/hooks/useMoveTask'
import { groupTasksByStatus } from './grouping'
import { sortTasks } from '../toolbar/sortTasks'
import { useTaskFilters } from '../toolbar/useTaskFilters'
import { TaskTable } from './TaskTable'
import type { Task } from '../../data/tasksRepo'

export function ListView() {
  const { activeId, loading: wsLoading } = useActiveWorkspace()
  const { data: tasks, isLoading, error } = useFilteredTasks(activeId ?? '')
  const { sort } = useTaskFilters()
  const { data: members } = useMembers(activeId ?? '')
  const { setTaskRef, taskRef } = useViewState()
  const update = useUpdateTask(activeId ?? '')
  const onPatch = (id: string, patch: Parameters<typeof update.mutate>[0]['patch']) =>
    update.mutate({ id, patch })
  const move = useMoveTask(activeId ?? '')
  const onMove = (task: Task, toStatus: Task['status']) =>
    move.mutate({ taskId: task.id, toStatus, position: task.position, fromStatus: task.status })

  if (wsLoading || isLoading) return <ListSkeleton />
  if (error) return <ErrorState />
  const groups = groupTasksByStatus(sortTasks(tasks ?? [], sort))
  if (groups.length === 0) return <EmptyState />

  return (
    <div className="overflow-x-auto pb-4">
      {groups.map((g) => (
        <TaskTable key={g.status} status={g.status} tasks={g.tasks}
          members={members ?? []} selectedRef={taskRef}
          onSelect={setTaskRef} onPatch={onPatch} onMove={onMove} />
      ))}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div role="status" aria-busy="true" className="pb-4">
      <span className="sr-only">Loading tasks…</span>
      {[0, 1].map((g) => (
        <section key={g} className="mb-6">
          <div className="mb-2.5 flex items-center gap-2 px-3">
            <div className="opm-skel h-2 w-2 rounded-full" />
            <div className="opm-skel h-3.5 w-24" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-[9px]">
              <div className="opm-skel h-4 w-4" />
              <div className="opm-skel h-3 w-14" />
              <div className="opm-skel h-3 flex-1" style={{ maxWidth: 220 + ((i * 53) % 160) }} />
              <div className="opm-skel h-6 w-24 rounded-full" />
              <div className="opm-skel h-6 w-20 rounded-full" />
              <div className="opm-skel h-6 w-20" />
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

function CenteredState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
      {children}
    </div>
  )
}

function EmptyState() {
  return (
    <CenteredState>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 6h12M8 12h12M8 18h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-base font-semibold text-[var(--text)]">No tasks yet</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">
        Work in this workspace will show up here, grouped by status and sorted by priority.
      </p>
    </CenteredState>
  )
}

function ErrorState() {
  return (
    <div role="alert">
      <CenteredState>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 8.5v4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="16.3" r="1.05" fill="currentColor" />
            <path d="M12 3.5 21 19.5H3L12 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-base font-semibold text-[var(--text)]">Couldn't load tasks.</p>
        <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">
          Check your connection and try again in a moment.
        </p>
      </CenteredState>
    </div>
  )
}
