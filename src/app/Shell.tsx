import { useState, useEffect, lazy, Suspense } from 'react'
import { useViewState, VIEWS, type ViewId } from './useViewState'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { useActiveWorkspace } from '../lib/workspace'
import { signOut } from '../lib/hooks/useSession'
import { useActorId } from '../lib/hooks/useSession'
import { useMembers } from '../lib/hooks/useMembers'
import { settingsPermissions } from '../features/settings/settingsPermissions'
import { WorkspaceSwitcher } from '../components/WorkspaceSwitcher'
import { TaskDrawer } from '../features/taskDrawer/TaskDrawer'
import { Toolbar } from '../features/toolbar/Toolbar'

// Views are route-level code-split: the login/shell path no longer bundles all six.
const ListView = lazy(() =>
  import('../features/listView/ListView').then((m) => ({ default: m.ListView })),
)
const BoardView = lazy(() =>
  import('../features/boardView/BoardView').then((m) => ({ default: m.BoardView })),
)
const ActivityView = lazy(() =>
  import('../features/activityView/ActivityView').then((m) => ({ default: m.ActivityView })),
)
const GanttView = lazy(() =>
  import('../features/ganttView/GanttView').then((m) => ({ default: m.GanttView })),
)
const TimelineView = lazy(() =>
  import('../features/timelineView/TimelineView').then((m) => ({ default: m.TimelineView })),
)
const WorkloadView = lazy(() =>
  import('../features/workloadView/WorkloadView').then((m) => ({ default: m.WorkloadView })),
)
const WorkspaceSettings = lazy(() =>
  import('../features/settings/WorkspaceSettings').then((m) => ({ default: m.WorkspaceSettings })),
)
const CreateWorkspaceForm = lazy(() =>
  import('../features/settings/WorkspaceSettings').then((m) => ({
    default: m.CreateWorkspaceForm,
  })),
)

const TASK_VIEWS: ViewId[] = ['list', 'board', 'gantt', 'timeline']

const LABEL: Record<ViewId, string> = {
  list: 'List',
  board: 'Board',
  gantt: 'Gantt',
  timeline: 'Timeline',
  activity: 'Activity',
  workload: 'Workload',
  settings: 'Settings',
}

export function Shell() {
  const { view, setView } = useViewState()
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const { activeId, loading: workspacesLoading } = useActiveWorkspace()
  const actorId = useActorId()
  const members = useMembers(activeId ?? '')
  const actorRole = members.data?.find((member) => member.user_id === actorId)?.role
  const canManageSettings = settingsPermissions(actorRole).canManage

  // Apply the theme to the DOM (and persist it) on mount and on every change,
  // so the DOM always reflects state — self-healing across remounts/desyncs.
  useEffect(() => {
    setTheme(theme)
  }, [theme])

  const toggleTheme = () => setThemeState((t) => (t === 'bloom' ? 'slate' : 'bloom'))

  if (!workspacesLoading && activeId === null)
    return (
      <div className="min-h-full grid place-items-center bg-[var(--bg)] text-[var(--text)]">
        <div className="w-full max-w-xl space-y-3 p-4 text-center">
          <Suspense fallback={<p>Loading…</p>}>
            <CreateWorkspaceForm />
          </Suspense>
          <button onClick={() => signOut()} className="opm-btn">
            Sign out
          </button>
        </div>
      </div>
    )

  return (
    <div className="opm-shell min-h-full bg-[var(--bg)] text-[var(--text)]">
      <aside className="opm-sidebar border-r border-[var(--border)] p-3 space-y-1">
        <div className="mb-3">
          <WorkspaceSwitcher />
        </div>
        {VIEWS.filter((v) => v !== 'settings' || canManageSettings).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`block w-full text-left px-3 py-2 rounded ${
              v === view ? 'bg-[var(--primary)] text-white' : 'hover:bg-[var(--surface)]'
            }`}
          >
            {LABEL[v]}
          </button>
        ))}
      </aside>
      <section className="flex flex-col">
        <header className="flex items-center justify-between px-4 h-12 border-b border-[var(--border)]">
          <span className="font-medium">{LABEL[view]}</span>
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="px-3 py-1 rounded border border-[var(--border)]"
          >
            Theme
          </button>
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
            ) : view === 'settings' ? (
              <WorkspaceSettings />
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
