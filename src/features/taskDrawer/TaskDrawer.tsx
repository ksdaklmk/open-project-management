import { useEffect, useRef } from 'react'
import { useViewState } from '../../app/useViewState'
import { useActiveWorkspace } from '../../lib/workspace'
import { useTasks } from '../../lib/hooks/useTasks'
import { DrawerFields } from './DrawerFields'

export function TaskDrawer() {
  const { taskRef, setTaskRef } = useViewState()
  const { activeId } = useActiveWorkspace()
  const { data: tasks } = useTasks(activeId ?? '')
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
    if (e.key === 'Escape') return close()
    if (e.key !== 'Tab') return
    const f = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
    )
    if (!f || f.length === 0) return
    const first = f[0]
    const last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button
        data-testid="drawer-backdrop"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-black/30"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative h-full w-[420px] max-w-full overflow-y-auto border-l border-[var(--border)] bg-[var(--bg)] text-[var(--text)] shadow-xl"
      >
        {task ? (
          <>
            <header className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
              <span className="text-xs font-medium tabular-nums text-[var(--muted)]">{task.ref}</span>
              <h2 id="drawer-title" className="flex-1 truncate font-medium">{task.title}</h2>
              <button onClick={close} aria-label="Close" className="rounded px-2 py-1 hover:bg-[var(--surface)]">✕</button>
            </header>
            <div data-testid="drawer-body" className="space-y-5 px-4 py-4">
              <DrawerFields task={task} workspaceId={activeId ?? ''} />
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p id="drawer-title" className="font-semibold">Task not found</p>
            <p className="text-sm text-[var(--muted)]">It may have moved workspace or been removed.</p>
            <button onClick={close} className="mt-2 rounded border border-[var(--border)] px-3 py-1">Close</button>
          </div>
        )}
      </div>
    </div>
  )
}
