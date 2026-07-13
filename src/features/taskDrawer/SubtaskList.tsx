import { useState } from 'react'
import { useSubtasks } from '../../lib/hooks/useSubtasks'

export function SubtaskList({ taskId }: { taskId: string }) {
  const { data, isLoading, error, refetch, add, toggle, remove } = useSubtasks(taskId)
  const rows = data ?? []
  const done = rows.filter((s) => s.done).length
  const [draft, setDraft] = useState('')

  const submit = () => {
    const t = draft.trim()
    if (!t || add.isPending) return
    add.mutate(t, { onSuccess: () => setDraft('') })
  }

  return (
    <section className="opm-document-section">
      <h3 className="opm-document-heading mb-3 flex items-center gap-2">
        Subtasks{' '}
        {rows.length > 0 && (
          <span className="tabular-nums">
            {done}/{rows.length}
          </span>
        )}
      </h3>
      {isLoading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
      {error && (
        <div role="alert" className="text-sm text-[var(--text)]">
          <p>Couldn't load subtasks.</p>
          <button type="button" className="opm-btn mt-2" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}
      <ul className="space-y-1">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              aria-label={s.title}
              checked={s.done}
              onChange={() => toggle.mutate({ id: s.id, done: !s.done })}
            />
            <span className={`flex-1 text-sm ${s.done ? 'line-through text-[var(--muted)]' : ''}`}>
              {s.title}
            </span>
            <button
              aria-label={`Remove ${s.title}`}
              onClick={() => remove.mutate(s.id)}
              className="opm-subtask-remove text-[var(--muted)]"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <input
        aria-label="New subtask"
        placeholder="Add a subtask…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        disabled={add.isPending}
        className="opm-input mt-2 text-sm"
      />
      {add.isPending && <p className="mt-1 text-xs text-[var(--muted)]">Adding subtask…</p>}
    </section>
  )
}
