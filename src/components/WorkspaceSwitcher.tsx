import { useWorkspaces } from '../lib/hooks/useWorkspaces'
import { useActiveWorkspace } from '../lib/workspace'

export function WorkspaceSwitcher() {
  const { data: workspaces } = useWorkspaces()
  const { activeId, setActiveId } = useActiveWorkspace()
  if (!workspaces?.length) return null
  return (
    <div>
      <label
        htmlFor="opm-workspace"
        className="mb-1 block px-0.5 text-[11px] font-medium text-[var(--muted)]"
      >
        Workspace
      </label>
      <span className="opm-field w-full">
        <select
          id="opm-workspace"
          aria-label="Workspace"
          value={activeId ?? ''}
          onChange={(e) => setActiveId(e.target.value)}
          className="opm-select font-medium"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <svg className="opm-caret" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M3 4.5 6 7.5 9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  )
}
