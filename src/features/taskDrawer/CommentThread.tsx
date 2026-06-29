import { useState } from 'react'
import { useComments, useAddComment } from '../../lib/hooks/useComments'
import { relativeTime } from '../../lib/relativeTime'

export function CommentThread({ taskId }: { taskId: string }) {
  const { data } = useComments(taskId)
  const add = useAddComment(taskId)
  const [draft, setDraft] = useState('')

  const submit = () => {
    const t = draft.trim()
    if (!t) return
    add.mutate(t)
    setDraft('')
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold text-[var(--muted)]">Comments</h3>
      <ul className="space-y-3">
        {(data ?? []).map((c) => (
          <li key={c.id}>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium">{c.author?.name || 'Someone'}</span>
              <span className="text-[11px] text-[var(--muted)]">{relativeTime(c.created_at)}</span>
            </div>
            <p className="text-sm text-[var(--text)]">{c.body}</p>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-2">
        <textarea
          aria-label="Add a comment" rows={2} placeholder="Write a comment…" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
        />
        <button onClick={submit} className="rounded bg-[var(--primary)] px-3 py-1 text-sm text-white">Post</button>
      </div>
    </section>
  )
}
