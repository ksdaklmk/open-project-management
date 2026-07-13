import { useState } from 'react'
import { useViewState } from '../../app/useViewState'
import type { MyWorkGroup, MyWorkItem, MyWorkScope } from '../../data/myWorkRepo'
import { LoadMoreButton } from '../../components/LoadMoreButton'
import { useMyWork } from '../../lib/hooks/useMyWork'
import { useActiveWorkspace } from '../../lib/workspace'
import { groupMyWork } from './groupMyWork'

const SCOPES: Array<[MyWorkScope, string]> = [
  ['assigned', 'Assigned'],
  ['overdue', 'Overdue'],
  ['due_soon', 'Due soon'],
  ['recent', 'Recently updated'],
]

export function MyWorkView() {
  const [scope, setScope] = useState<MyWorkScope>('assigned')
  const [group, setGroup] = useState<MyWorkGroup>('workspace')
  const { setActiveId } = useActiveWorkspace()
  const { setTaskRef } = useViewState()
  const query = useMyWork(scope)

  const openTask = (item: MyWorkItem) => {
    setActiveId(item.workspaceId)
    setTaskRef(item.ref)
  }

  if (query.isLoading) return <p role="status">Loading your work…</p>
  if (query.error)
    return (
      <div role="alert" className="opm-state mx-auto max-w-xl py-12 text-center">
        <p className="font-semibold text-[var(--text)]">Couldn’t load your work.</p>
        <button type="button" className="opm-btn mt-3" onClick={() => query.refetch()}>
          Retry
        </button>
      </div>
    )

  const groups = groupMyWork(query.data, group)
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div>
          <p className="opm-kicker">Across all workspaces</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Only tasks assigned to you are included.
          </p>
        </div>
        <label className="text-xs font-medium text-[var(--muted)]">
          Group by
          <select
            aria-label="Group My Work"
            className="opm-select ml-2"
            value={group}
            onChange={(event) => setGroup(event.target.value as MyWorkGroup)}
          >
            <option value="workspace">Workspace</option>
            <option value="project">Project</option>
            <option value="date">Due date</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex gap-1 overflow-x-auto" role="group" aria-label="My Work scope">
        {SCOPES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={value === scope ? 'opm-btn-primary' : 'opm-btn'}
            aria-pressed={value === scope}
            onClick={() => setScope(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {groups.length === 0 ? (
        <div className="opm-state py-16 text-center">
          <p className="font-semibold text-[var(--text)]">Nothing in this view</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Assigned tasks will appear here across every workspace you can access.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {groups.map(([label, items]) => (
            <section key={label} aria-labelledby={`my-work-${label.replace(/\W+/g, '-')}`}>
              <h2 id={`my-work-${label.replace(/\W+/g, '-')}`} className="opm-section-title mb-2">
                {label} <span className="text-[var(--muted)]">{items.length}</span>
              </h2>
              <ul className="overflow-hidden rounded-md border border-[var(--border)] divide-y divide-[var(--border)]">
                {items.map((item) => (
                  <li key={item.id} className="opm-row flex items-center gap-3 px-3 py-2.5">
                    <button
                      type="button"
                      className="opm-task-open min-w-0 flex-1 text-left"
                      onClick={() => openTask(item)}
                      aria-label={`Open ${item.ref}: ${item.title}`}
                    >
                      <span className="opm-task-ref mr-2">{item.ref}</span>
                      <span className="opm-task-title text-[var(--text)]">{item.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                        {item.workspaceName} / {item.projectName}
                      </span>
                    </button>
                    <span className="opm-chip" data-tone={item.priority}>
                      {item.priority}
                    </span>
                    <time className="w-24 text-right text-xs text-[var(--muted)]">
                      {item.endDate ?? 'No due date'}
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {query.hasNextPage && (
        <LoadMoreButton
          label="Load more work"
          pending={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        />
      )}
    </div>
  )
}
