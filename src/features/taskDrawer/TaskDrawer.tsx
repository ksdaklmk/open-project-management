import { useEffect, useRef, useState } from 'react'
import { useViewState } from '../../app/useViewState'
import { useActiveWorkspace } from '../../lib/workspace'
import { useTasks } from '../../lib/hooks/useTasks'
import { useDeleteTask } from '../../lib/hooks/useDeleteTask'
import { DrawerFields } from './DrawerFields'
import { TagEditor } from './TagEditor'
import { SubtaskList } from './SubtaskList'
import { CommentThread } from './CommentThread'

export function TaskDrawer() {
  const { taskRef, setTaskRef } = useViewState()
  const { activeId } = useActiveWorkspace()
  const { data: tasks, isLoading, error } = useTasks(activeId ?? '')
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  const close = () => setTaskRef(null)
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
      // Title/description save on blur; unmounting never fires it. Blur the
      // active field first so a dirty value is saved, not discarded.
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      return close()
    }
    if (e.key !== 'Tab') return
    const f = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
    )
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
    <div className="fixed inset-0 z-30 flex justify-end">
      <button
        data-testid="drawer-backdrop"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-black/30 opm-drawer-backdrop"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="opm-drawer-panel relative h-full w-[420px] max-w-full overflow-y-auto border-l border-[var(--border)] bg-[var(--bg)] text-[var(--text)] shadow-xl"
      >
        {task ? (
          <>
            <header className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
              <span className="text-xs font-medium tabular-nums text-[var(--muted)]">
                {task.ref}
              </span>
              <h2 id="drawer-title" className="flex-1 truncate font-medium">
                {task.title}
              </h2>
              <button
                onClick={close}
                aria-label="Close"
                className="rounded px-2 py-1 hover:bg-[var(--surface)]"
              >
                ✕
              </button>
            </header>
            <div data-testid="drawer-body" className="space-y-5 px-4 py-4">
              <DrawerFields key={task.id} task={task} workspaceId={activeId ?? ''} />
              <TagEditor task={task} workspaceId={activeId ?? ''} />
              <SubtaskList taskId={task.id} />
              <CommentThread taskId={task.id} workspaceId={activeId ?? ''} />
              <footer className="border-t border-[var(--border)] pt-4">
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
  const [confirming, setConfirming] = useState(false)
  const del = useDeleteTask(workspaceId)

  if (!confirming)
    return (
      <button onClick={() => setConfirming(true)} className="opm-btn">
        Delete task
      </button>
    )

  return (
    <div className="flex items-center gap-2 text-sm">
      <span>Delete this task?</span>
      <button
        onClick={() => del.mutate(taskId, { onSuccess: onDeleted })}
        className="opm-btn font-semibold"
      >
        Delete
      </button>
      {/* autoFocus lands on the safe option; both stay inside the drawer's focus trap */}
      <button autoFocus onClick={() => setConfirming(false)} className="opm-btn">
        Cancel
      </button>
    </div>
  )
}
