import { useState } from 'react'
import { useComments, useAddComment } from '../../lib/hooks/useComments'
import { relativeTime } from '../../lib/relativeTime'

export function CommentThread({ taskId, workspaceId }: { taskId: string; workspaceId: string }) {
  const { data, isLoading, error } = useComments(taskId)
  const add = useAddComment(taskId, workspaceId)
  const [draft, setDraft] = useState('')

  const submit = () => {
    const t = draft.trim()
    if (!t) return
    add.mutate(t, { onSuccess: () => setDraft('') })
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold text-[var(--muted)]">Comments</h3>
      {isLoading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
      {error && <p className="text-sm text-[var(--text)]">Couldn't load comments.</p>}
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
          className="opm-input text-sm"
        />
        <button onClick={submit} className="opm-btn-primary text-sm">Post</button>
      </div>
    </section>
  )
}
