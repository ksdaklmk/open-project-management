export function LoadMoreButton({
  label = 'Load more',
  pending,
  onClick,
}: {
  label?: string
  pending: boolean
  onClick: () => void
}) {
  return (
    <div className="mt-4 flex justify-center">
      <button type="button" className="opm-btn" disabled={pending} onClick={onClick}>
        {pending ? 'Loading…' : label}
      </button>
    </div>
  )
}
