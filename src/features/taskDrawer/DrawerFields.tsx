import { useEffect, useRef, useState } from 'react'
import { TASK_TYPES } from '../../types/constants'
import { StatusCell, PriorityCell, AssigneeCell, type Patch } from '../listView/cells'
import { useUpdateTask } from '../../lib/hooks/useUpdateTask'
import { useMoveTask } from '../../lib/hooks/useMoveTask'
import { useMembers } from '../../lib/hooks/useMembers'
import type { Task } from '../../data/tasksRepo'
import {
  dateRangeError,
  MAX_TASK_DATE,
  MIN_TASK_DATE,
  pointsError,
  titleError,
} from '../../lib/validation'

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
  const [startDate, setStartDate] = useState(task.start_date ?? '')
  const [endDate, setEndDate] = useState(task.end_date ?? '')
  const [validationMessage, setValidationMessage] = useState('')
  const previousTask = useRef({
    title: task.title,
    description: task.description,
    startDate: task.start_date ?? '',
    endDate: task.end_date ?? '',
  })

  // Realtime can replace the cached task while the drawer stays mounted. Adopt
  // remote values only when the corresponding local draft is still pristine,
  // so another user's edit appears without overwriting in-progress typing.
  useEffect(() => {
    const previous = previousTask.current
    setTitle((current) => (current === previous.title ? task.title : current))
    setDesc((current) => (current === previous.description ? task.description : current))
    setStartDate((current) => (current === previous.startDate ? (task.start_date ?? '') : current))
    setEndDate((current) => (current === previous.endDate ? (task.end_date ?? '') : current))
    previousTask.current = {
      title: task.title,
      description: task.description,
      startDate: task.start_date ?? '',
      endDate: task.end_date ?? '',
    }
  }, [task.title, task.description, task.start_date, task.end_date])

  return (
    <div className="space-y-6">
      <label className="block">
        <span className="sr-only">Title</span>
        <input
          aria-label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            const error = titleError(title)
            setValidationMessage(error ?? '')
            if (!error && title !== task.title) save({ title: title.trim() })
          }}
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
            max={999}
            step={1}
            defaultValue={task.points ?? ''}
            onBlur={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value)
              const error = pointsError(v)
              e.target.setCustomValidity(error ?? '')
              setValidationMessage(error ?? '')
              if (!error && v !== task.points) save({ points: v })
            }}
            className="opm-input"
          />
        </Field>
        <Field label="Start">
          <input
            aria-label="Start date"
            type="date"
            min={MIN_TASK_DATE}
            max={MAX_TASK_DATE}
            value={startDate}
            onChange={(e) => {
              const value = e.target.value
              setStartDate(value)
              const error = dateRangeError(value || null, endDate || null)
              e.target.setCustomValidity(error ?? '')
              setValidationMessage(error ?? '')
              if (!error && value !== (task.start_date ?? ''))
                save({ start_date: value || null, end_date: endDate || null })
            }}
            className="opm-input"
          />
        </Field>
        <Field label="Due">
          <input
            aria-label="Due date"
            type="date"
            min={MIN_TASK_DATE}
            max={MAX_TASK_DATE}
            value={endDate}
            onChange={(e) => {
              const value = e.target.value
              setEndDate(value)
              const error = dateRangeError(startDate || null, value || null)
              e.target.setCustomValidity(error ?? '')
              setValidationMessage(error ?? '')
              if (!error && value !== (task.end_date ?? ''))
                save({ start_date: startDate || null, end_date: value || null })
            }}
            className="opm-input"
          />
        </Field>
      </div>

      {validationMessage && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {validationMessage}
        </p>
      )}

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
