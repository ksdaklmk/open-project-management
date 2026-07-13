import { useEffect, useRef, useState } from 'react'
import { TASK_TYPES } from '../../types/constants'
import { StatusCell, PriorityCell, AssigneeCell, type Patch } from '../listView/cells'
import { useUpdateTask } from '../../lib/hooks/useUpdateTask'
import { useMoveTask } from '../../lib/hooks/useMoveTask'
import { useMembers } from '../../lib/hooks/useMembers'
import type { Task } from '../../data/tasksRepo'

export function DrawerFields({ task, workspaceId }: { task: Task; workspaceId: string }) {
  const update = useUpdateTask(workspaceId)
  const move = useMoveTask(workspaceId)
  const { data: members } = useMembers(workspaceId)
  const save = (patch: Parameters<typeof update.mutate>[0]['patch']) =>
    update.mutate({ id: task.id, patch })
  // Status routes through useMoveTask (not useUpdateTask) so a drawer status change
  // is logged to the Activity feed and recomputes board position, exactly like the
  // List status dropdown. Other fields stay on the plain update.
  const onStatus = (p: Patch) => {
    if (p.status)
      move.mutate({
        taskId: task.id,
        toStatus: p.status,
        position: task.position,
        fromStatus: task.status,
      })
  }

  const [title, setTitle] = useState(task.title)
  const [desc, setDesc] = useState(task.description)
  const previousTask = useRef({ title: task.title, description: task.description })

  // Realtime can replace the cached task while the drawer stays mounted. Adopt
  // remote values only when the corresponding local draft is still pristine,
  // so another user's edit appears without overwriting in-progress typing.
  useEffect(() => {
    const previous = previousTask.current
    setTitle((current) => (current === previous.title ? task.title : current))
    setDesc((current) => (current === previous.description ? task.description : current))
    previousTask.current = { title: task.title, description: task.description }
  }, [task.title, task.description])

  return (
    <div className="space-y-6">
      <label className="block">
        <span className="sr-only">Title</span>
        <input
          aria-label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== task.title && save({ title })}
          className="opm-document-title"
        />
      </label>

      <div className="opm-property-grid grid grid-cols-2 gap-x-4 gap-y-2">
        <Field label="Status">
          <StatusCell task={task} onChange={onStatus} />
        </Field>
        <Field label="Priority">
          <PriorityCell task={task} onChange={save} />
        </Field>
        <Field label="Assignee">
          <AssigneeCell task={task} members={members ?? []} onChange={save} />
        </Field>
        <Field label="Type">
          <select
            aria-label="Type"
            value={task.type}
            onChange={(e) => save({ type: e.target.value as Task['type'] })}
            className="opm-input"
          >
            {Object.entries(TASK_TYPES).map(([id, t]) => (
              <option key={id} value={id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Points">
          <input
            aria-label="Points"
            type="number"
            min={0}
            defaultValue={task.points ?? ''}
            onBlur={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value)
              if (v !== task.points) save({ points: v })
            }}
            className="opm-input"
          />
        </Field>
        <Field label="Start">
          <input
            aria-label="Start date"
            type="date"
            defaultValue={task.start_date ?? ''}
            onChange={(e) => save({ start_date: e.target.value || null })}
            className="opm-input"
          />
        </Field>
        <Field label="Due">
          <input
            aria-label="Due date"
            type="date"
            defaultValue={task.end_date ?? ''}
            onChange={(e) => save({ end_date: e.target.value || null })}
            className="opm-input"
          />
        </Field>
      </div>

      <label className="block">
        <span className="opm-field-label mb-2 block">Description</span>
        <textarea
          aria-label="Description"
          rows={4}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== task.description && save({ description: desc })}
          className="opm-input opm-description"
        />
      </label>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="opm-field-label mb-1 block">{label}</span>
      {children}
    </label>
  )
}
