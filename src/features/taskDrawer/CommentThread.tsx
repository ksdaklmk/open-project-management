import { useState, type KeyboardEvent } from 'react'
import { useComments, useAddComment } from '../../lib/hooks/useComments'
import { useMembers } from '../../lib/hooks/useMembers'
import { relativeTime } from '../../lib/relativeTime'
import { LoadMoreButton } from '../../components/LoadMoreButton'

export function CommentThread({ taskId, workspaceId }: { taskId: string; workspaceId: string }) {
  const { data, isLoading, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useComments(taskId)
  const add = useAddComment(taskId, workspaceId)
  const members = useMembers(workspaceId)
  const [draft, setDraft] = useState('')
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([])
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false)

  const mentionMatch = draft.match(/(?:^|\s)@([^@\n]*)$/)
  const mentionQuery = mentionMatch?.[1].trim().toLocaleLowerCase() ?? ''
  const suggestions = mentionMatch
    ? (members.data ?? [])
        .filter(
          (member) =>
            !!member.name &&
            !mentionedUserIds.includes(member.user_id) &&
            member.name.toLocaleLowerCase().includes(mentionQuery),
        )
        .slice(0, 5)
    : []
  const showSuggestions = !suggestionsDismissed && suggestions.length > 0

  const selectMention = (index: number) => {
    const member = suggestions[index]
    if (!member) return
    const at = draft.lastIndexOf('@')
    setDraft(`${draft.slice(0, at)}@${member.name} `)
    setMentionedUserIds((current) => [...current, member.user_id])
    setSuggestionsDismissed(true)
  }

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveSuggestion((current) => (current + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveSuggestion((current) => (current - 1 + suggestions.length) % suggestions.length)
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      selectMention(activeSuggestion)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setSuggestionsDismissed(true)
    }
  }

  const submit = () => {
    const t = draft.trim()
    if (!t || add.isPending) return
    const validMentionIds = mentionedUserIds.filter((userId) => {
      const member = members.data?.find((candidate) => candidate.user_id === userId)
      return member ? t.includes(`@${member.name}`) : false
    })
    add.mutate(
      { body: t, mentionedUserIds: validMentionIds },
      {
        onSuccess: () => {
          setDraft('')
          setMentionedUserIds([])
          setSuggestionsDismissed(false)
        },
      },
    )
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
      {hasNextPage && (
        <LoadMoreButton
          label="Load older comments"
          pending={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        />
      )}
      <div className="mt-3 space-y-2">
        <textarea
          aria-label="Add a comment"
          aria-describedby="comment-mention-help"
          aria-controls={showSuggestions ? 'comment-mention-suggestions' : undefined}
          aria-activedescendant={
            showSuggestions
              ? `comment-mention-${suggestions[activeSuggestion]?.user_id}`
              : undefined
          }
          rows={2}
          placeholder="Write a comment… Use @ to mention someone"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setActiveSuggestion(0)
            setSuggestionsDismissed(false)
          }}
          onKeyDown={onComposerKeyDown}
          disabled={add.isPending}
          className="opm-input text-sm"
        />
        <span id="comment-mention-help" className="sr-only">
          Type @ followed by a member name. Use arrow keys and Enter to select a suggestion.
        </span>
        {showSuggestions && (
          <ul
            id="comment-mention-suggestions"
            role="listbox"
            aria-label="Workspace members"
            className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-sm"
          >
            {suggestions.map((member, index) => (
              <li
                id={`comment-mention-${member.user_id}`}
                key={member.user_id}
                role="option"
                aria-selected={index === activeSuggestion}
                className="cursor-pointer px-3 py-2 text-sm aria-selected:bg-[var(--surface-hover)]"
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveSuggestion(index)}
                onClick={() => selectMention(index)}
              >
                {member.name}
              </li>
            ))}
          </ul>
        )}
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
