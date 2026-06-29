import { useRef } from 'react'
import { useFilteredTasks } from '../../lib/hooks/useFilteredTasks'
import { useMembers } from '../../lib/hooks/useMembers'
import { useMoveTask } from '../../lib/hooks/useMoveTask'
import { useActiveWorkspace } from '../../lib/workspace'
import { useViewState } from '../../app/useViewState'
import { STATUSES } from '../../types/constants'
import { boardColumns } from './boardColumns'
import { BoardColumn } from './BoardColumn'
import { dropPosition } from './computeDropPosition'
import type { Status } from '../../types/constants'

export function BoardView() {
  const { activeId, loading: wsLoading } = useActiveWorkspace()
  const { data: tasks, isLoading, error } = useFilteredTasks(activeId ?? '')
  const { data: members } = useMembers(activeId ?? '')
  const move = useMoveTask(activeId ?? '')
  const { setTaskRef } = useViewState()
  const dragId = useRef<string | null>(null)

  const onCardDragStart = (taskId: string) => { dragId.current = taskId }

  const onDrop = (toStatus: Status, insertIndex: number) => {
    const taskId = dragId.current
    dragId.current = null
    if (!taskId) return
    const all = tasks ?? []
    const dragged = all.find((t) => t.id === taskId)
    if (!dragged) return
    const sorted = all
      .filter((t) => t.status === toStatus)
      .sort((a, b) => a.position - b.position)
    const position = dropPosition(sorted, taskId, insertIndex)
    move.mutate({ taskId, toStatus, position, fromStatus: dragged.status })
  }

  if (wsLoading || isLoading) return <BoardSkeleton />
  if (error) return <BoardError />

  const columns = boardColumns(tasks ?? [])
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {columns.map((c) => (
        <BoardColumn
          key={c.status}
          status={c.status}
          tasks={c.tasks}
          members={members ?? []}
          onCardDragStart={onCardDragStart}
          onDrop={onDrop}
          onOpen={setTaskRef}
        />
      ))}
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex gap-3 overflow-x-auto pb-4">
      <span className="sr-only">Loading tasks…</span>
      {STATUSES.map((s) => (
        <div
          key={s.id}
          className="flex w-64 shrink-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--bg)]"
        >
          {/* Skeleton header */}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <div className="opm-skel h-2 w-2 rounded-full" />
            <div className="opm-skel h-3 w-20 rounded" />
            <div className="opm-skel ml-auto h-4 w-5 rounded-full" />
          </div>
          <div className="mx-3 h-px bg-[var(--border)]" />
          {/* Skeleton cards — varying heights for realism */}
          <div className="flex flex-col gap-2 p-2">
            {[72, 88, 60].map((h, i) => (
              <div key={i} className="opm-skel rounded-lg" style={{ height: h }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function BoardError() {
  return (
    <div
      role="alert"
      className="flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 8.5v4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="16.3" r="1.05" fill="currentColor" />
          <path d="M12 3.5 21 19.5H3L12 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-base font-semibold text-[var(--text)]">Couldn't load tasks.</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">
        Check your connection and try again.
      </p>
    </div>
  )
}
