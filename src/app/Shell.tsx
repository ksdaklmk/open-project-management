import { useState, useEffect, lazy, Suspense } from 'react'
import { useViewState, VIEWS, type ViewId } from './useViewState'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { useActiveWorkspace } from '../lib/workspace'
import { signOut } from '../lib/hooks/useSession'
import { WorkspaceSwitcher } from '../components/WorkspaceSwitcher'
import { TaskDrawer } from '../features/taskDrawer/TaskDrawer'
import { Toolbar } from '../features/toolbar/Toolbar'

// Views are route-level code-split: the login/shell path no longer bundles all six.
const ListView = lazy(() => import('../features/listView/ListView').then((m) => ({ default: m.ListView })))
const BoardView = lazy(() => import('../features/boardView/BoardView').then((m) => ({ default: m.BoardView })))
const ActivityView = lazy(() => import('../features/activityView/ActivityView').then((m) => ({ default: m.ActivityView })))
const GanttView = lazy(() => import('../features/ganttView/GanttView').then((m) => ({ default: m.GanttView })))
const TimelineView = lazy(() => import('../features/timelineView/TimelineView').then((m) => ({ default: m.TimelineView })))
const WorkloadView = lazy(() => import('../features/workloadView/WorkloadView').then((m) => ({ default: m.WorkloadView })))

const TASK_VIEWS: ViewId[] = ['list', 'board', 'gantt', 'timeline']

const LABEL: Record<ViewId, string> = {
  list: 'List', board: 'Board', gantt: 'Gantt',
  timeline: 'Timeline', activity: 'Activity', workload: 'Workload',
}

export function Shell() {
  const { view, setView } = useViewState()
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const { activeId, loading: workspacesLoading } = useActiveWorkspace()

  // Apply the theme to the DOM (and persist it) on mount and on every change,
  // so the DOM always reflects state — self-healing across remounts/desyncs.
  useEffect(() => {
    setTheme(theme)
  }, [theme])

  const toggleTheme = () => setThemeState((t) => (t === 'bloom' ? 'slate' : 'bloom'))

  if (!workspacesLoading && activeId === null)
    return (
      <div className="min-h-full grid place-items-center bg-[var(--bg)] text-[var(--text)]">
        <div className="w-96 max-w-full space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
          <h1 className="text-lg font-semibold">No workspace yet</h1>
          <p className="text-sm text-[var(--muted)]">Ask your workspace admin to add you.</p>
          <button onClick={() => signOut()} className="opm-btn">Sign out</button>
        </div>
      </div>
    )

  return (
    <div className="min-h-full grid grid-cols-[200px_1fr] bg-[var(--bg)] text-[var(--text)]">
      <aside className="border-r border-[var(--border)] p-3 space-y-1">
        <div className="mb-3"><WorkspaceSwitcher /></div>
        {VIEWS.map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`block w-full text-left px-3 py-2 rounded ${
              v === view ? 'bg-[var(--primary)] text-white' : 'hover:bg-[var(--surface)]'}`}>
            {LABEL[v]}
          </button>
        ))}
      </aside>
      <section className="flex flex-col">
        <header className="flex items-center justify-between px-4 h-12 border-b border-[var(--border)]">
          <span className="font-medium">{LABEL[view]}</span>
          <button onClick={toggleTheme} aria-label="Toggle theme"
            className="px-3 py-1 rounded border border-[var(--border)]">Theme</button>
        </header>
        {TASK_VIEWS.includes(view) && <Toolbar showSort={view === 'list'} />}
        <main data-testid="view-region" className="flex-1 p-4 text-[var(--muted)]">
          <Suspense fallback={<p className="text-[var(--muted)]">Loading…</p>}>
            {view === 'list' ? (
              <ListView />
            ) : view === 'board' ? (
              <BoardView />
            ) : view === 'gantt' ? (
              <GanttView />
            ) : view === 'timeline' ? (
              <TimelineView />
            ) : view === 'activity' ? (
              <ActivityView />
            ) : view === 'workload' ? (
              <WorkloadView />
            ) : (
              `${view} view — coming next.`
            )}
          </Suspense>
        </main>
      </section>
      <TaskDrawer />
    </div>
  )
}
