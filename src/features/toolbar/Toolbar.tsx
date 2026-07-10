import { useState, useRef, useEffect } from 'react'
import { STATUSES, PRIORITIES, TASK_TYPES, TAG_COLORS } from '../../types/constants'
import { useViewState } from '../../app/useViewState'
import { useActiveWorkspace } from '../../lib/workspace'
import { useMembers } from '../../lib/hooks/useMembers'
import { useProjects } from '../../lib/hooks/useProjects'
import { useCreateTask } from '../../lib/hooks/useCreateTask'
import type { ProjectOption } from '../../data/projectsRepo'
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
      <NewTask workspaceId={activeId ?? ''} />
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

function NewTask({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  const { data: projects } = useProjects(workspaceId)
  const { setTaskRef } = useViewState()
  const create = useCreateTask(workspaceId)

  // Return focus to the button when the inline input closes (cancel or success).
  useEffect(() => {
    if (!open && wasOpen.current) btnRef.current?.focus()
    wasOpen.current = open
  }, [open])

  const project: ProjectOption | undefined =
    projects?.find((p) => p.id === projectId) ?? projects?.[0]

  if (!open)
    return (
      <button
        ref={btnRef}
        className="opm-btn"
        disabled={!projects?.length}
        title={projects?.length ? undefined : 'Create a project first (see docs/admin.md)'}
        onClick={() => setOpen(true)}
      >
        + New task
      </button>
    )

  const submit = () => {
    const t = title.trim()
    if (!t || !project) return
    create.mutate(
      { title: t, project },
      {
        onSuccess: (task) => {
          setTitle('')
          setOpen(false)
          setTaskRef(task.ref)
        },
      },
    )
  }

  return (
    <div className="flex items-center gap-1">
      <input
        aria-label="New task title"
        placeholder="Task title…"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') setOpen(false) // draft kept for reopening
        }}
        className="opm-input w-56"
      />
      {(projects?.length ?? 0) > 1 && (
        <select
          aria-label="Project"
          value={project?.id ?? ''}
          onChange={(e) => setProjectId(e.target.value)}
          className="opm-input w-auto"
        >
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>{p.key} — {p.name}</option>
          ))}
        </select>
      )}
    </div>
  )
}
