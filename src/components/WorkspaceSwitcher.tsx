import { useWorkspaces } from '../lib/hooks/useWorkspaces'
import { useActiveWorkspace } from '../lib/workspace'
import { AppIcon } from './AppIcon'

export function WorkspaceSwitcher() {
  const { data: workspaces } = useWorkspaces()
  const { activeId, setActiveId } = useActiveWorkspace()
  if (!workspaces?.length) return null
  const active = workspaces.find((workspace) => workspace.id === activeId) ?? workspaces[0]
  return (
    <div className="opm-workspace-switcher" data-workspace={active.name} title={active.name}>
      <span className="opm-workspace-mark" aria-hidden="true">
        <AppIcon name="workspace" size={17} />
      </span>
      <label htmlFor="opm-workspace" className="sr-only">
        Workspace
      </label>
      <select
        id="opm-workspace"
        aria-label="Workspace"
        value={activeId ?? ''}
        onChange={(e) => setActiveId(e.target.value)}
        className="opm-workspace-select"
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </div>
  )
}
