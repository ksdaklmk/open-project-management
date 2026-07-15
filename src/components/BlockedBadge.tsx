export function BlockedBadge({ count, compact = false }: { count?: number; compact?: boolean }) {
  if (!count) return null
  const label = `Blocked by ${count} unfinished ${count === 1 ? 'task' : 'tasks'}`
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--danger)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--danger)]"
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">◆</span>
      {compact ? count : 'Blocked'}
    </span>
  )
}
