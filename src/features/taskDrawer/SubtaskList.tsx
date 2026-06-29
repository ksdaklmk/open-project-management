import { useState } from 'react'
import { useSubtasks } from '../../lib/hooks/useSubtasks'

export function SubtaskList({ taskId }: { taskId: string }) {
  const { data, add, toggle, remove } = useSubtasks(taskId)
  const rows = data ?? []
  const done = rows.filter((s) => s.done).length
  const [draft, setDraft] = useState('')

  const submit = () => {
    const t = draft.trim()
    if (!t) return
    add.mutate(t)
    setDraft('')
  }

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
        Subtasks {rows.length > 0 && <span className="tabular-nums">{done}/{rows.length}</span>}
      </h3>
      <ul className="space-y-1">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <input
              type="checkbox" aria-label={s.title} checked={s.done}
              onChange={() => toggle.mutate({ id: s.id, done: !s.done })}
            />
            <span className={`flex-1 text-sm ${s.done ? 'line-through text-[var(--muted)]' : ''}`}>{s.title}</span>
            <button aria-label={`Remove ${s.title}`} onClick={() => remove.mutate(s.id)} className="text-[var(--muted)]">✕</button>
          </li>
        ))}
      </ul>
      <input
        aria-label="New subtask" placeholder="Add a subtask…" value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
      />
    </section>
  )
}
