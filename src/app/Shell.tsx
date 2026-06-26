import { useState } from 'react'
import { useViewState, VIEWS, type ViewId } from './useViewState'
import { getTheme, setTheme, type Theme } from '../lib/theme'

const LABEL: Record<ViewId, string> = {
  list: 'List', board: 'Board', gantt: 'Gantt',
  timeline: 'Timeline', activity: 'Activity', workload: 'Workload',
}

export function Shell() {
  const { view, setView } = useViewState()
  const [theme, setThemeState] = useState<Theme>(getTheme())

  const toggleTheme = () => {
    const next: Theme = theme === 'bloom' ? 'slate' : 'bloom'
    setTheme(next)
    setThemeState(next)
  }

  return (
    <div className="min-h-full grid grid-cols-[200px_1fr] bg-[var(--bg)] text-[var(--text)]">
      <aside className="border-r border-[var(--border)] p-3 space-y-1">
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
          {view} view — coming next.
        </main>
      </section>
    </div>
  )
}
