import { useEffect, useRef, useState } from 'react'
import { useViewState } from '../../app/useViewState'
import { useActiveWorkspace } from '../../lib/workspace'
import { useTasks } from '../../lib/hooks/useTasks'
import { useDeleteTask } from '../../lib/hooks/useDeleteTask'
import { DrawerFields } from './DrawerFields'
import { TagEditor } from './TagEditor'
import { SubtaskList } from './SubtaskList'
import { CommentThread } from './CommentThread'
import { AppIcon } from '../../components/AppIcon'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function TaskDrawer() {
  const { taskRef, setTaskRef } = useViewState()
  const { activeId } = useActiveWorkspace()
  const { data: tasks, isLoading, error, refetch } = useTasks(activeId ?? '')
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  const close = () => {
    // Title and description save on blur. Blur before every explicit close path
    // so backdrop, close button, Escape, and post-delete closure behave alike.
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    setTaskRef(null)
  }
  const task = taskRef ? tasks?.find((t) => t.ref === taskRef) : undefined

  // Focus the panel on open; restore focus to the opener on close.
  // ponytail: minimal focus management — querySelectorAll boundaries; reach for a
  // focus-trap lib only if the panel ever grows nested dialogs.
  useEffect(() => {
    if (!taskRef) return
    openerRef.current = document.activeElement as HTMLElement
    dialogRef.current?.focus()
    return () => openerRef.current?.focus?.()
  }, [taskRef])

  if (!taskRef) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      return close()
    }
    if (e.key !== 'Tab') return
    const f = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (!f || f.length === 0) return
    const first = f[0]
    const last = f[f.length - 1]
    // On open the container itself holds focus (tabIndex -1); treat that as the
    // backward boundary so Shift+Tab wraps to last instead of escaping the panel.
    const onPanel = document.activeElement === dialogRef.current
    if (e.shiftKey && (onPanel || document.activeElement === first)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 'var(--layer-backdrop)' }}>
      <button
        data-testid="drawer-backdrop"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-black/20 opm-drawer-backdrop"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="opm-drawer-panel relative h-full w-[540px] max-w-full overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
        style={{ zIndex: 'var(--layer-modal)' }}
      >
        {task ? (
          <>
            <header className="opm-drawer-header flex items-center gap-2 border-b border-[var(--border)] px-5 py-3">
              <span className="opm-task-ref">{task.ref}</span>
              <h2 id="drawer-title" className="sr-only">
                {task.title}
              </h2>
              <span className="flex-1" />
              <button onClick={close} aria-label="Close" className="opm-icon-btn">
                <AppIcon name="close" size={16} />
              </button>
            </header>
            <div data-testid="drawer-body" className="opm-drawer-body space-y-8 px-8 py-7">
              <DrawerFields key={task.id} task={task} workspaceId={activeId ?? ''} />
              <TagEditor task={task} workspaceId={activeId ?? ''} />
              <SubtaskList taskId={task.id} />
              <CommentThread taskId={task.id} workspaceId={activeId ?? ''} />
              <footer className="border-t border-[var(--border)] pt-6">
                <DeleteTaskButton taskId={task.id} workspaceId={activeId ?? ''} onDeleted={close} />
              </footer>
            </div>
          </>
        ) : isLoading ? (
          <div
            role="status"
            aria-busy="true"
            className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center"
          >
            <p id="drawer-title" className="text-[var(--muted)]">
              Loading…
            </p>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p id="drawer-title" className="font-semibold">
              Couldn't load this task
            </p>
            <p className="text-sm text-[var(--muted)]">Check your connection, then try again.</p>
            <button type="button" onClick={() => refetch()} className="opm-btn mt-2">
              Retry
            </button>
            <button onClick={close} className="opm-btn mt-2">
              Close
            </button>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p id="drawer-title" className="font-semibold">
              Task not found
            </p>
            <p className="text-sm text-[var(--muted)]">
              It may have moved workspace or been removed.
            </p>
            <button onClick={close} className="opm-btn mt-2">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function DeleteTaskButton({
  taskId,
  workspaceId,
  onDeleted,
}: {
  taskId: string
  workspaceId: string
  onDeleted: () => void
}) {
  const [confirmingTaskId, setConfirmingTaskId] = useState<string | null>(null)
  const del = useDeleteTask(workspaceId)
  const confirming = confirmingTaskId === taskId

  if (!confirming)
    return (
      <button
        onClick={() => setConfirmingTaskId(taskId)}
        className="opm-btn opm-btn-danger"
        disabled={del.isPending}
      >
        Delete task
      </button>
    )

  return (
    <div className="flex items-center gap-2 text-sm">
      <span>Delete this task?</span>
      <button
        onClick={() => del.mutate(taskId, { onSuccess: onDeleted })}
        className="opm-btn opm-btn-danger font-semibold"
        disabled={del.isPending}
      >
        {del.isPending ? 'Deleting…' : 'Delete'}
      </button>
      {/* autoFocus lands on the safe option; both stay inside the drawer's focus trap */}
      <button
        autoFocus
        onClick={() => setConfirmingTaskId(null)}
        className="opm-btn"
        disabled={del.isPending}
      >
        Cancel
      </button>
    </div>
  )
}
