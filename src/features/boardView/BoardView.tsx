import { useRef, useState } from 'react'
import { useFilteredTasks } from '../../lib/hooks/useFilteredTasks'
import { useMembers } from '../../lib/hooks/useMembers'
import { useMoveTask } from '../../lib/hooks/useMoveTask'
import { useActiveWorkspace } from '../../lib/workspace'
import { useViewState } from '../../app/useViewState'
import { STATUSES } from '../../types/constants'
import { boardColumns } from './boardColumns'
import { BoardColumn } from './BoardColumn'
import { dropTarget } from './computeDropPosition'
import type { Status } from '../../types/constants'

export function BoardView() {
  const { activeId, loading: wsLoading } = useActiveWorkspace()
  const { data: tasks, isLoading, error, refetch } = useFilteredTasks(activeId ?? '')
  const { data: members } = useMembers(activeId ?? '')
  const move = useMoveTask(activeId ?? '')
  const { setTaskRef, taskRef } = useViewState()
  const dragId = useRef<string | null>(null)
  const [moveAnnouncement, setMoveAnnouncement] = useState('')

  const onCardDragStart = (taskId: string) => {
    dragId.current = taskId
  }

  const moveTask = (taskId: string, toStatus: Status, insertIndex: number, announce = false) => {
    const all = tasks ?? []
    const dragged = all.find((t) => t.id === taskId)
    if (!dragged) return
    const sorted = all.filter((t) => t.status === toStatus).sort((a, b) => a.position - b.position)
    const target = dropTarget(sorted, taskId, insertIndex)
    const statusLabel = STATUSES.find((status) => status.id === toStatus)?.label ?? toStatus
    const args = { taskId, toStatus, ...target, fromStatus: dragged.status }
    if (!announce) return move.mutate(args)
    move.mutate(args, {
      onSuccess: () => {
        const targetTasks = sorted.filter((task) => task.id !== taskId)
        const position = targetTasks.filter((task) => task.position < target.position).length + 1
        setMoveAnnouncement(`${dragged.ref} moved to ${statusLabel}, position ${position}.`)
      },
      onError: () => setMoveAnnouncement(`${dragged.ref} could not be moved.`),
    })
  }

  const onDrop = (toStatus: Status, insertIndex: number) => {
    const taskId = dragId.current
    dragId.current = null
    if (!taskId) return
    moveTask(taskId, toStatus, insertIndex)
  }

  const onAccessibleMove = (taskId: string, toStatus: Status, insertIndex?: number) => {
    const targetLength = (tasks ?? []).filter((task) => task.status === toStatus).length
    moveTask(taskId, toStatus, insertIndex ?? targetLength, true)
  }

  if (wsLoading || isLoading) return <BoardSkeleton />
  if (error) return <BoardError onRetry={() => refetch()} />

  const columns = boardColumns(tasks ?? [])
  return (
    <>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {moveAnnouncement}
      </p>
      <div className="opm-board flex gap-3 overflow-x-auto pb-4">
        {columns.map((c) => (
          <BoardColumn
            key={c.status}
            status={c.status}
            tasks={c.tasks}
            members={members ?? []}
            onCardDragStart={onCardDragStart}
            onDrop={onDrop}
            onMove={onAccessibleMove}
            onOpen={setTaskRef}
            selectedRef={taskRef}
          />
        ))}
      </div>
    </>
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

function BoardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="opm-state flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center"
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
