import { useState } from 'react'
import { useComments, useAddComment } from '../../lib/hooks/useComments'
import { relativeTime } from '../../lib/relativeTime'

export function CommentThread({ taskId, workspaceId }: { taskId: string; workspaceId: string }) {
  const { data, isLoading, error, refetch } = useComments(taskId)
  const add = useAddComment(taskId, workspaceId)
  const [draft, setDraft] = useState('')

  const submit = () => {
    const t = draft.trim()
    if (!t || add.isPending) return
    add.mutate(t, { onSuccess: () => setDraft('') })
  }

  return (
    <section className="opm-document-section">
      <h3 className="opm-document-heading mb-3">Comments</h3>
      {isLoading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
      {error && (
        <div role="alert" className="text-sm text-[var(--text)]">
          <p>Couldn't load comments.</p>
          <button type="button" className="opm-btn mt-2" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}
      <ul className="space-y-3">
        {(data ?? []).map((c) => (
          <li key={c.id}>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium">{c.author?.name || 'Someone'}</span>
              <span className="text-xs text-[var(--muted)]">{relativeTime(c.created_at)}</span>
            </div>
            <p className="max-w-[70ch] text-sm leading-relaxed text-[var(--text)]">{c.body}</p>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-2">
        <textarea
          aria-label="Add a comment"
          rows={2}
          placeholder="Write a comment…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={add.isPending}
          className="opm-input text-sm"
        />
        <button
          onClick={submit}
          className="opm-btn-primary text-sm"
          disabled={!draft.trim() || add.isPending}
        >
          {add.isPending ? 'Posting…' : 'Post'}
        </button>
      </div>
    </section>
  )
}
