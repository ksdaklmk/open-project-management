import { useState } from 'react'
import { TASK_TYPES } from '../../types/constants'
import { StatusCell, PriorityCell, AssigneeCell } from '../listView/cells'
import { useUpdateTask } from '../../lib/hooks/useUpdateTask'
import { useMembers } from '../../lib/hooks/useMembers'
import type { Task } from '../../data/tasksRepo'

export function DrawerFields({ task, workspaceId }: { task: Task; workspaceId: string }) {
  const update = useUpdateTask(workspaceId)
  const { data: members } = useMembers(workspaceId)
  const save = (patch: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: task.id, patch })

  const [title, setTitle] = useState(task.title)
  const [desc, setDesc] = useState(task.description)

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Title</span>
        <input
          aria-label="Title" value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== task.title && save({ title })}
          className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status"><StatusCell task={task} onChange={save} /></Field>
        <Field label="Priority"><PriorityCell task={task} onChange={save} /></Field>
        <Field label="Assignee"><AssigneeCell task={task} members={members ?? []} onChange={save} /></Field>
        <Field label="Type">
          <select
            aria-label="Type" value={task.type}
            onChange={(e) => save({ type: e.target.value as Task['type'] })}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
          >
            {Object.entries(TASK_TYPES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Points">
          <input
            aria-label="Points" type="number" min={0} defaultValue={task.points ?? ''}
            onBlur={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value)
              if (v !== task.points) save({ points: v })
            }}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
          />
        </Field>
        <Field label="Start">
          <input
            aria-label="Start date" type="date" defaultValue={task.start_date ?? ''}
            onChange={(e) => save({ start_date: e.target.value || null })}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
          />
        </Field>
        <Field label="Due">
          <input
            aria-label="Due date" type="date" defaultValue={task.end_date ?? ''}
            onChange={(e) => save({ end_date: e.target.value || null })}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
          />
        </Field>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Description</span>
        <textarea
          aria-label="Description" rows={4} value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== task.description && save({ description: desc })}
          className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
        />
      </label>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--muted)]">{label}</span>
      {children}
    </label>
  )
}
