import { useState, useEffect } from 'react'
import { useViewState, VIEWS, type ViewId } from './useViewState'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { WorkspaceSwitcher } from '../components/WorkspaceSwitcher'
import { ListView } from '../features/listView/ListView'
import { BoardView } from '../features/boardView/BoardView'
import { ActivityView } from '../features/activityView/ActivityView'
import { GanttView } from '../features/ganttView/GanttView'
import { TimelineView } from '../features/timelineView/TimelineView'
import { WorkloadView } from '../features/workloadView/WorkloadView'

const LABEL: Record<ViewId, string> = {
  list: 'List', board: 'Board', gantt: 'Gantt',
  timeline: 'Timeline', activity: 'Activity', workload: 'Workload',
}

export function Shell() {
  const { view, setView } = useViewState()
  const [theme, setThemeState] = useState<Theme>(getTheme())

  // Apply the theme to the DOM (and persist it) on mount and on every change,
  // so the DOM always reflects state — self-healing across remounts/desyncs.
  useEffect(() => {
    setTheme(theme)
  }, [theme])

  const toggleTheme = () => setThemeState((t) => (t === 'bloom' ? 'slate' : 'bloom'))

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
        <main data-testid="view-region" className="flex-1 p-4 text-[var(--muted)]">
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
        </main>
      </section>
    </div>
  )
}
