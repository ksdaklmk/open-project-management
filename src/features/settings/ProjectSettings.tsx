import { useState, type FormEvent } from 'react'
import { useProjects } from '../../lib/hooks/useProjects'
import { useProjectAdmin } from '../../lib/hooks/useProjectAdmin'
import { normaliseProjectKey, projectKeyError } from '../../lib/validation'

export function ProjectSettings({ workspaceId }: { workspaceId: string }) {
  const projects = useProjects(workspaceId)
  const admin = useProjectAdmin(workspaceId)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [archiving, setArchiving] = useState<string | null>(null)
  const [validationMessage, setValidationMessage] = useState('')

  const create = (event: FormEvent) => {
    event.preventDefault()
    const error = projectKeyError(key)
    setValidationMessage(error ?? '')
    if (error || !name.trim()) return
    admin.create.mutate(
      { name: name.trim(), key: normaliseProjectKey(key) },
      {
        onSuccess: () => {
          setName('')
          setKey('')
        },
      },
    )
  }

  return (
    <section className="opm-settings-card" aria-labelledby="project-settings-title">
      <div>
        <h2 id="project-settings-title" className="font-semibold text-[var(--text)]">
          Projects
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Create, rename, or archive workspace projects.
        </p>
      </div>

      <form onSubmit={create} className="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
        <label className="text-sm font-medium text-[var(--text)]">
          Project name
          <input
            className="opm-input mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="text-sm font-medium text-[var(--text)]">
          Key
          <input
            className="opm-input mt-1 uppercase"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            pattern="[A-Za-z][A-Za-z0-9]{0,11}"
            title="Use 1–12 letters or numbers, starting with a letter."
            maxLength={12}
            required
          />
        </label>
        <button className="opm-btn-primary" disabled={admin.create.isPending}>
          {admin.create.isPending ? 'Creating…' : 'Create project'}
        </button>
      </form>
      {validationMessage && (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {validationMessage}
        </p>
      )}

      {projects.isLoading ? (
        <p className="mt-4 text-sm">Loading projects…</p>
      ) : projects.error ? (
        <div className="mt-4" role="alert">
          <p>Couldn’t load projects.</p>
          <button className="opm-btn mt-2" onClick={() => projects.refetch()}>
            Retry
          </button>
        </div>
      ) : !projects.data?.length ? (
        <p className="mt-4 text-sm">No active projects.</p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--border)]">
          {projects.data.map((project) => (
            <li key={project.id} className="flex flex-wrap items-center gap-3 py-3">
              {editing === project.id ? (
                <form
                  className="flex min-w-0 flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    admin.update.mutate(
                      { projectId: project.id, name: editName },
                      { onSuccess: () => setEditing(null) },
                    )
                  }}
                >
                  <label className="sr-only" htmlFor={`project-name-${project.id}`}>
                    Project name
                  </label>
                  <input
                    id={`project-name-${project.id}`}
                    autoFocus
                    className="opm-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                  <button className="opm-btn-primary" disabled={admin.update.isPending}>
                    {admin.update.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" className="opm-btn" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[var(--text)]">{project.name}</p>
                  <p className="text-xs text-[var(--muted)]">{project.key}</p>
                </div>
              )}
              {editing !== project.id && archiving !== project.id && (
                <>
                  <button
                    className="opm-btn"
                    onClick={() => {
                      setEditing(project.id)
                      setEditName(project.name)
                    }}
                  >
                    Rename
                  </button>
                  <button className="opm-btn" onClick={() => setArchiving(project.id)}>
                    Archive
                  </button>
                </>
              )}
              {archiving === project.id && (
                <div
                  className="flex items-center gap-2"
                  role="group"
                  aria-label={`Confirm archive ${project.name}`}
                >
                  <span className="text-sm">Archive this project?</span>
                  <button autoFocus className="opm-btn" onClick={() => setArchiving(null)}>
                    Cancel
                  </button>
                  <button
                    className="opm-btn"
                    disabled={admin.archive.isPending}
                    onClick={() =>
                      admin.archive.mutate(project.id, { onSuccess: () => setArchiving(null) })
                    }
                  >
                    {admin.archive.isPending ? 'Archiving…' : 'Confirm archive'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
