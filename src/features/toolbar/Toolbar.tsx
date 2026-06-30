import { STATUSES, PRIORITIES, TASK_TYPES, TAG_COLORS } from '../../types/constants'
import { useActiveWorkspace } from '../../lib/workspace'
import { useMembers } from '../../lib/hooks/useMembers'
import { useTaskFilters } from './useTaskFilters'
import type { SortKey } from './sortTasks'

type ListKey = 'status' | 'priority' | 'assignee' | 'type' | 'tag'
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'priority', label: 'Priority' }, { id: 'due', label: 'Due date' },
  { id: 'title', label: 'Title' }, { id: 'status', label: 'Status' },
]

export function Toolbar({ showSort }: { showSort: boolean }) {
  const { activeId } = useActiveWorkspace()
  const { data: members } = useMembers(activeId ?? '')
  const { filters, sort, setList, setQ, setSort, clear } = useTaskFilters()

  const toggle = (key: ListKey, id: string) => {
    const cur = filters[key]
    setList(key, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  }
  const active =
    filters.status.length || filters.priority.length || filters.assignee.length ||
    filters.type.length || filters.tag.length || filters.q.trim()

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-2 text-sm">
      <input
        aria-label="Search tasks" placeholder="Search…" value={filters.q}
        onChange={(e) => setQ(e.target.value)}
        className="opm-input w-48"
      />
      <Group label="Status" selected={filters.status}
        options={STATUSES.map((s) => ({ id: s.id, label: s.label }))} onToggle={(id) => toggle('status', id)} />
      <Group label="Priority" selected={filters.priority}
        options={PRIORITIES.map((p) => ({ id: p.id, label: p.label }))} onToggle={(id) => toggle('priority', id)} />
      <Group label="Type" selected={filters.type}
        options={Object.entries(TASK_TYPES).map(([id, t]) => ({ id, label: t.label }))} onToggle={(id) => toggle('type', id)} />
      <Group label="Tag" selected={filters.tag}
        options={Object.keys(TAG_COLORS).map((t) => ({ id: t, label: t }))} onToggle={(id) => toggle('tag', id)} />
      <Group label="Assignee" selected={filters.assignee}
        options={[{ id: '', label: 'Unassigned' }, ...(members ?? []).map((m) => ({ id: m.user_id, label: m.name || 'Someone' }))]} onToggle={(id) => toggle('assignee', id)} />
      {showSort && (
        <label className="ml-auto flex items-center gap-1">
          <span className="text-[var(--muted)]">Sort</span>
          <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
            className="opm-input w-auto">
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      )}
      {active ? (
        <button onClick={clear} className={`opm-btn${showSort ? '' : ' ml-auto'}`}>
          Clear filters
        </button>
      ) : null}
    </div>
  )
}

// Native <details> disclosure — no popover dependency.
function Group({ label, options, selected, onToggle }: {
  label: string
  options: { id: string; label: string }[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <details className="relative">
      <summary className="opm-btn list-none">
        {label}{selected.length ? ` (${selected.length})` : ''}
      </summary>
      <div className="absolute z-20 mt-1 flex flex-col gap-1 rounded border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 whitespace-nowrap">
            <input type="checkbox" checked={selected.includes(o.id)} onChange={() => onToggle(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
    </details>
  )
}
