import { lazy, Suspense, useState } from 'react'
import { useViewState, VIEWS, type ViewId } from './useViewState'
import { useActiveWorkspace } from '../lib/workspace'
import { signOut } from '../lib/hooks/useSession'
import { useActorId } from '../lib/hooks/useSession'
import { useMembers } from '../lib/hooks/useMembers'
import { settingsPermissions } from '../features/settings/settingsPermissions'
import { WorkspaceSwitcher } from '../components/WorkspaceSwitcher'
import { TaskDrawer } from '../features/taskDrawer/TaskDrawer'
import { Toolbar } from '../features/toolbar/Toolbar'
import { AppIcon, type AppIconName } from '../components/AppIcon'

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

const VIEW_ICON: Record<ViewId, AppIconName> = {
  list: 'list',
  board: 'board',
  gantt: 'gantt',
  timeline: 'timeline',
  activity: 'activity',
  workload: 'workload',
  settings: 'settings',
}

export function Shell() {
  const { view, setView } = useViewState()
  const { activeId, loading: workspacesLoading } = useActiveWorkspace()
  const actorId = useActorId()
  const members = useMembers(activeId ?? '')
  const actorRole = members.data?.find((member) => member.user_id === actorId)?.role
  const canManageSettings = settingsPermissions(actorRole).canManage
  const [signOutPending, setSignOutPending] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  const handleSignOut = async () => {
    if (signOutPending) return
    setSignOutPending(true)
    setSignOutError('')
    try {
      const result = await signOut()
      if (result?.error) setSignOutError(`Couldn't sign out: ${result.error.message}`)
    } catch (error) {
      setSignOutError(`Couldn't sign out: ${(error as Error).message}`)
    } finally {
      setSignOutPending(false)
    }
  }

  if (!workspacesLoading && activeId === null)
    return (
      <main className="min-h-full grid place-items-center bg-[var(--bg)] text-[var(--text)]">
        <div className="w-full max-w-xl space-y-3 p-4 text-center">
          <Suspense fallback={<p>Loading…</p>}>
            <CreateWorkspaceForm />
          </Suspense>
          <button onClick={handleSignOut} className="opm-btn" disabled={signOutPending}>
            {signOutPending ? 'Signing out…' : 'Sign out'}
          </button>
          {signOutError && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {signOutError}
            </p>
          )}
        </div>
      </main>
    )

  return (
    <div className="opm-shell min-h-full bg-[var(--bg)] text-[var(--text)]">
      <a href="#main-content" className="opm-skip-link">
        Skip to main content
      </a>
      <nav aria-label="Workspace views" className="opm-sidebar">
        <div className="opm-sidebar-brand">
          <WorkspaceSwitcher />
        </div>
        <div className="opm-sidebar-views">
          {VIEWS.filter((v) => v !== 'settings').map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-label={LABEL[v]}
              aria-current={v === view ? 'page' : undefined}
              className="opm-nav-button"
              data-label={LABEL[v]}
            >
              <AppIcon name={VIEW_ICON[v]} />
              <span className="sr-only">{LABEL[v]}</span>
            </button>
          ))}
        </div>
        <div className="opm-sidebar-actions">
          {canManageSettings && (
            <button
              type="button"
              onClick={() => setView('settings')}
              aria-label="Settings"
              aria-current={view === 'settings' ? 'page' : undefined}
              className="opm-nav-button"
              data-label="Settings"
            >
              <AppIcon name="settings" />
              <span className="sr-only">Settings</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signOutPending}
            aria-label="Sign out"
            className="opm-nav-button"
            data-label="Sign out"
          >
            <AppIcon name="logout" />
            <span className="sr-only">Sign out</span>
          </button>
        </div>
      </nav>
      <section className="opm-view-frame">
        <header aria-label="View controls" className="opm-view-header">
          <p className="opm-breadcrumb" aria-hidden="true">
            Projects <span>/</span>
          </p>
          <h1>{LABEL[view]}</h1>
        </header>
        {TASK_VIEWS.includes(view) && <Toolbar showSort={view === 'list'} />}
        <main
          id="main-content"
          data-testid="view-region"
          aria-label={`${LABEL[view]} view`}
          className="opm-main"
          data-view={view}
        >
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
      {signOutError && (
        <p
          role="alert"
          className="fixed right-4 top-4 rounded-md border border-[var(--danger)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--danger)]"
          style={{ zIndex: 'var(--layer-toast)' }}
        >
          {signOutError}
        </p>
      )}
    </div>
  )
}
