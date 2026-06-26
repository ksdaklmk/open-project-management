import { useWorkspaces } from '../lib/hooks/useWorkspaces'
import { useActiveWorkspace } from '../lib/workspace'

export function WorkspaceSwitcher() {
  const { data: workspaces } = useWorkspaces()
  const { activeId, setActiveId } = useActiveWorkspace()
  if (!workspaces?.length) return null
  return (
    <select
      aria-label="Workspace"
      value={activeId ?? ''}
      onChange={(e) => setActiveId(e.target.value)}
      className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
    >
      {workspaces.map((w) => (
        <option key={w.id} value={w.id}>{w.name}</option>
      ))}
    </select>
  )
}
