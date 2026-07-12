import { TAG_COLORS } from '../../types/constants'
import { useTaskTags } from '../../lib/hooks/useTaskTags'
import type { Task } from '../../data/tasksRepo'
import type { CSSProperties } from 'react'

export function TagEditor({ task, workspaceId }: { task: Task; workspaceId: string }) {
  const { add, remove } = useTaskTags(workspaceId)
  const available = Object.keys(TAG_COLORS).filter((t) => !task.tags.includes(t))

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold text-[var(--muted)]">Tags</h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {task.tags.map((tg) => (
          <span
            key={tg}
            className="opm-tag"
            style={{ '--chip': TAG_COLORS[tg] ?? 'var(--faint)' } as CSSProperties}
          >
            {tg}
            <button
              aria-label={`Remove ${tg}`}
              onClick={() => remove.mutate({ id: task.id, tag: tg })}
              className="ml-1"
            >
              ✕
            </button>
          </span>
        ))}
        {available.length > 0 && (
          <select
            aria-label="Add tag"
            value=""
            onChange={(e) => e.target.value && add.mutate({ id: task.id, tag: e.target.value })}
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-xs"
          >
            <option value="">＋ Add tag</option>
            {available.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>
    </section>
  )
}
