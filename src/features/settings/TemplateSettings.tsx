import { useState, type FormEvent } from 'react'
import type { ProjectTemplate } from '../../data/templatesRepo'
import { useProjectTemplates } from '../../lib/hooks/useProjectTemplates'
import { useProjects } from '../../lib/hooks/useProjects'
import {
  MAX_TASK_DATE,
  MIN_TASK_DATE,
  capacityError,
  normaliseProjectKey,
  projectKeyError,
} from '../../lib/validation'

function localDate(offsetDays = 0) {
  const value = new Date()
  value.setDate(value.getDate() + offsetDays)
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset())
  return value.toISOString().slice(0, 10)
}

function templateStats(template: ProjectTemplate) {
  const tasks = template.definition.tasks
  return {
    tasks: tasks.length,
    subtasks: tasks.reduce((total, task) => total + task.subtasks.length, 0),
    dependencies: tasks.reduce((total, task) => total + task.depends_on.length, 0),
  }
}

export function TemplateSettings({ workspaceId }: { workspaceId: string }) {
  const projects = useProjects(workspaceId)
  const templates = useProjectTemplates(workspaceId)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sourceProjectId, setSourceProjectId] = useState('')
  const [anchorDate, setAnchorDate] = useState(() => localDate())
  const [capacity, setCapacity] = useState('40')
  const [validationMessage, setValidationMessage] = useState('')
  const [usingId, setUsingId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')
  const [projectKey, setProjectKey] = useState('')
  const [projectAnchor, setProjectAnchor] = useState(() => localDate())
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const capture = (event: FormEvent) => {
    event.preventDefault()
    const projectId = sourceProjectId || projects.data?.[0]?.id || ''
    const capacityValue = Number(capacity)
    const error = capacityError(capacityValue)
    setValidationMessage(error ?? '')
    if (!projectId || !name.trim() || error) return
    templates.capture.mutate(
      {
        projectId,
        name: name.trim(),
        description: description.trim(),
        anchorDate,
        capacityPerWeek: capacityValue,
      },
      {
        onSuccess: () => {
          setName('')
          setDescription('')
        },
      },
    )
  }

  const createFromTemplate = (event: FormEvent, templateId: string) => {
    event.preventDefault()
    const error = projectKeyError(projectKey)
    setValidationMessage(error ?? '')
    if (!projectName.trim() || error) return
    templates.instantiate.mutate(
      {
        templateId,
        projectName: projectName.trim(),
        projectKey: normaliseProjectKey(projectKey),
        anchorDate: projectAnchor,
      },
      {
        onSuccess: () => {
          setUsingId(null)
          setProjectKey('')
        },
      },
    )
  }

  return (
    <section className="opm-settings-card" aria-labelledby="template-settings-title">
      <div>
        <h2 id="template-settings-title" className="font-semibold text-[var(--text)]">
          Project templates
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Capture tasks, subtasks, relative dates, tags, dependencies, and capacity assumptions.
        </p>
      </div>

      <form onSubmit={capture} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-[var(--text)]">
          Template name
          <input
            className="opm-input mt-1"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label className="text-sm font-medium text-[var(--text)]">
          Source project
          <select
            className="opm-select mt-1"
            value={sourceProjectId || projects.data?.[0]?.id || ''}
            onChange={(event) => setSourceProjectId(event.target.value)}
            required
          >
            {(projects.data ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.key} — {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--text)]">
          Date anchor
          <input
            className="opm-input mt-1"
            type="date"
            min={MIN_TASK_DATE}
            max={MAX_TASK_DATE}
            value={anchorDate}
            onChange={(event) => setAnchorDate(event.target.value)}
            required
          />
        </label>
        <label className="text-sm font-medium text-[var(--text)]">
          Capacity assumption (hours/week)
          <input
            className="opm-input mt-1"
            type="number"
            min={0}
            max={168}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            required
          />
        </label>
        <label className="text-sm font-medium text-[var(--text)] sm:col-span-2">
          Description (optional)
          <textarea
            className="opm-input mt-1 min-h-20"
            value={description}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <div className="sm:col-span-2">
          <button
            className="opm-btn-primary"
            disabled={templates.capture.isPending || !projects.data?.length}
          >
            {templates.capture.isPending ? 'Saving template…' : 'Save project as template'}
          </button>
        </div>
      </form>

      {validationMessage && (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {validationMessage}
        </p>
      )}

      {templates.isLoading ? (
        <p className="mt-5 text-sm">Loading templates…</p>
      ) : templates.error ? (
        <div className="mt-5" role="alert">
          <p>Couldn’t load project templates.</p>
          <button className="opm-btn mt-2" onClick={() => templates.refetch()}>
            Retry
          </button>
        </div>
      ) : !templates.data?.length ? (
        <p className="mt-5 text-sm text-[var(--muted)]">No project templates yet.</p>
      ) : (
        <ul className="mt-5 divide-y divide-[var(--border)]">
          {templates.data.map((template) => {
            const stats = templateStats(template)
            return (
              <li key={template.id} className="py-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[var(--text)]">{template.name}</p>
                    {template.description && (
                      <p className="mt-1 text-sm text-[var(--muted)]">{template.description}</p>
                    )}
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {stats.tasks} tasks · {stats.subtasks} subtasks · {stats.dependencies}{' '}
                      dependencies · {template.definition.project.capacity_per_week}h/week
                    </p>
                  </div>
                  {usingId !== template.id && deletingId !== template.id && (
                    <>
                      <button
                        type="button"
                        className="opm-btn-primary"
                        onClick={() => {
                          setUsingId(template.id)
                          setProjectName(template.definition.project.name)
                          setProjectKey('')
                          setProjectAnchor(localDate())
                        }}
                      >
                        Use template
                      </button>
                      <button
                        type="button"
                        className="opm-btn"
                        onClick={() => setDeletingId(template.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>

                {usingId === template.id && (
                  <form
                    className="mt-3 grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3 sm:grid-cols-[1fr_8rem_10rem_auto] sm:items-end"
                    onSubmit={(event) => createFromTemplate(event, template.id)}
                  >
                    <label className="text-sm font-medium text-[var(--text)]">
                      New project name
                      <input
                        autoFocus
                        className="opm-input mt-1"
                        value={projectName}
                        onChange={(event) => setProjectName(event.target.value)}
                        required
                      />
                    </label>
                    <label className="text-sm font-medium text-[var(--text)]">
                      New project key
                      <input
                        className="opm-input mt-1 uppercase"
                        value={projectKey}
                        pattern="[A-Za-z][A-Za-z0-9]{0,11}"
                        maxLength={12}
                        onChange={(event) => setProjectKey(event.target.value)}
                        required
                      />
                    </label>
                    <label className="text-sm font-medium text-[var(--text)]">
                      Start anchor
                      <input
                        className="opm-input mt-1"
                        type="date"
                        min={MIN_TASK_DATE}
                        max={MAX_TASK_DATE}
                        value={projectAnchor}
                        onChange={(event) => setProjectAnchor(event.target.value)}
                        required
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        className="opm-btn-primary"
                        disabled={templates.instantiate.isPending}
                      >
                        {templates.instantiate.isPending ? 'Creating…' : 'Create'}
                      </button>
                      <button type="button" className="opm-btn" onClick={() => setUsingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {deletingId === template.id && (
                  <div
                    className="mt-3 flex flex-wrap items-center gap-2"
                    role="group"
                    aria-label={`Confirm delete ${template.name}`}
                  >
                    <span className="text-sm">Delete this template and its schedule?</span>
                    <button autoFocus className="opm-btn" onClick={() => setDeletingId(null)}>
                      Cancel
                    </button>
                    <button
                      className="opm-btn-danger"
                      disabled={templates.remove.isPending}
                      onClick={() =>
                        templates.remove.mutate(template.id, {
                          onSuccess: () => setDeletingId(null),
                        })
                      }
                    >
                      {templates.remove.isPending ? 'Deleting…' : 'Delete template'}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
