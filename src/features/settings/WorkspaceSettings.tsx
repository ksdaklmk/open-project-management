import { useState, type FormEvent } from 'react'
import { useActiveWorkspace } from '../../lib/workspace'
import { useActorId } from '../../lib/hooks/useSession'
import { useMembers } from '../../lib/hooks/useMembers'
import { useWorkspaces } from '../../lib/hooks/useWorkspaces'
import { useCreateWorkspace, useUpdateWorkspace } from '../../lib/hooks/useWorkspaceAdmin'
import { settingsPermissions } from './settingsPermissions'
import { ProjectSettings } from './ProjectSettings'
import { MemberSettings } from './MemberSettings'
import { InvitationSettings } from './InvitationSettings'

export function CreateWorkspaceForm({ embedded = false }: { embedded?: boolean }) {
  const create = useCreateWorkspace()
  const { setActiveId } = useActiveWorkspace()
  const [name, setName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectKey, setProjectKey] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate(
      { name, initialProjectName: projectName, initialProjectKey: projectKey },
      { onSuccess: ({ workspaceId }) => setActiveId(workspaceId) },
    )
  }
  return (
    <form
      onSubmit={submit}
      className="opm-settings-card opm-settings-form w-full max-w-xl text-left"
    >
      {embedded ? (
        <h2 className="font-semibold text-[var(--text)]">Create another workspace</h2>
      ) : (
        <h1 className="text-lg font-semibold text-[var(--text)]">Create your workspace</h1>
      )}
      <p className="mt-1 text-sm text-[var(--muted)]">
        Start with a workspace and its first project.
      </p>
      <div className="mt-4 grid gap-3">
        <label className="text-sm font-medium text-[var(--text)]">
          Workspace name
          <input
            autoFocus={!embedded}
            className="opm-input mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="text-sm font-medium text-[var(--text)]">
          Initial project name
          <input
            className="opm-input mt-1"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            required
          />
        </label>
        <label className="text-sm font-medium text-[var(--text)]">
          Project key
          <input
            className="opm-input mt-1 uppercase"
            value={projectKey}
            onChange={(e) => setProjectKey(e.target.value)}
            maxLength={12}
            required
          />
        </label>
      </div>
      <button className="opm-btn-primary mt-4" disabled={create.isPending}>
        {create.isPending ? 'Creating…' : 'Create workspace'}
      </button>
    </form>
  )
}

export function WorkspaceSettings() {
  const { activeId } = useActiveWorkspace()
  const actorId = useActorId()
  const workspaces = useWorkspaces()
  const members = useMembers(activeId ?? '')
  const update = useUpdateWorkspace()
  const workspace = workspaces.data?.find((item) => item.id === activeId)
  const actorRole = members.data?.find((member) => member.user_id === actorId)?.role
  const permissions = settingsPermissions(actorRole)
  const [name, setName] = useState('')

  if (!activeId)
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <CreateWorkspaceForm />
      </div>
    )
  if (members.isLoading || workspaces.isLoading) return <p>Loading settings…</p>
  if (members.error || workspaces.error)
    return (
      <div role="alert" className="opm-settings-card">
        <p>Couldn’t load workspace settings.</p>
        <button
          className="opm-btn mt-2"
          onClick={() => {
            members.refetch()
            workspaces.refetch()
          }}
        >
          Retry
        </button>
      </div>
    )
  if (!permissions.canManage)
    return (
      <div role="alert" className="opm-settings-card">
        <h1 className="font-semibold text-[var(--text)]">Settings unavailable</h1>
        <p className="mt-1 text-sm">Only workspace owners and admins can manage settings.</p>
      </div>
    )

  const submitName = (event: FormEvent) => {
    event.preventDefault()
    update.mutate(
      { workspaceId: activeId, name: name || workspace?.name || '' },
      { onSuccess: () => setName('') },
    )
  }

  return (
    <div className="opm-settings mx-auto w-full max-w-5xl">
      <section className="opm-settings-card" aria-labelledby="workspace-settings-title">
        <h1 id="workspace-settings-title" className="text-lg font-semibold text-[var(--text)]">
          Workspace settings
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Manage {workspace?.name ?? 'this workspace'} and its access.
        </p>
        <form onSubmit={submitName} className="mt-4 flex max-w-xl items-end gap-2">
          <label className="min-w-0 flex-1 text-sm font-medium text-[var(--text)]">
            Display name
            <input
              className="opm-input mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={workspace?.name}
              required
            />
          </label>
          <button className="opm-btn-primary" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save name'}
          </button>
        </form>
      </section>
      <ProjectSettings workspaceId={activeId} />
      <InvitationSettings workspaceId={activeId} actorRole={actorRole!} />
      <MemberSettings workspaceId={activeId} actorId={actorId} actorRole={actorRole!} />
      <CreateWorkspaceForm embedded />
    </div>
  )
}
