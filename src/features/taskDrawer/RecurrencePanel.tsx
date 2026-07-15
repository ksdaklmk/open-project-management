import { useState, type FormEvent } from 'react'
import type { RecurrenceFrequency, TaskRecurrence } from '../../data/recurrencesRepo'
import type { Task } from '../../data/tasksRepo'
import { useTaskRecurrence } from '../../lib/hooks/useTaskRecurrence'
import { MAX_TASK_DATE, MIN_TASK_DATE } from '../../lib/validation'

const COMMON_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/New_York',
  'Europe/London',
  'Europe/Paris',
  'Asia/Bangkok',
  'Asia/Tokyo',
  'Australia/Sydney',
]

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function nextLocalMorning() {
  const value = new Date()
  value.setDate(value.getDate() + 1)
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset())
  return { date: value.toISOString().slice(0, 10), time: '09:00' }
}

export function occurrenceFields(instant: string, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(instant))
    const field = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? ''
    return {
      date: `${field('year')}-${field('month')}-${field('day')}`,
      time: `${field('hour')}:${field('minute')}`,
    }
  } catch {
    return nextLocalMorning()
  }
}

export function RecurrencePanel({ task, workspaceId }: { task: Task; workspaceId: string }) {
  const recurrence = useTaskRecurrence(task.id, workspaceId)
  if (recurrence.isLoading)
    return (
      <section aria-labelledby="recurrence-title">
        <h3 id="recurrence-title" className="opm-section-title">
          Recurrence
        </h3>
        <p className="mt-2 text-sm text-[var(--muted)]">Loading schedule…</p>
      </section>
    )
  if (recurrence.error)
    return (
      <section aria-labelledby="recurrence-title">
        <h3 id="recurrence-title" className="opm-section-title">
          Recurrence
        </h3>
        <div role="alert" className="mt-2 text-sm">
          <p>Couldn’t load this recurrence.</p>
          <button className="opm-btn mt-2" onClick={() => recurrence.refetch()}>
            Retry
          </button>
        </div>
      </section>
    )
  return (
    <RecurrenceForm
      key={recurrence.data?.updated_at ?? 'new'}
      recurrence={recurrence.data}
      task={task}
      save={recurrence.save}
      remove={recurrence.remove}
    />
  )
}

function RecurrenceForm({
  recurrence,
  task,
  save,
  remove,
}: {
  recurrence: TaskRecurrence | null | undefined
  task: Task
  save: ReturnType<typeof useTaskRecurrence>['save']
  remove: ReturnType<typeof useTaskRecurrence>['remove']
}) {
  const first = recurrence
    ? occurrenceFields(recurrence.next_occurrence_at, recurrence.timezone)
    : nextLocalMorning()
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(recurrence?.frequency ?? 'weekly')
  const [interval, setInterval] = useState(String(recurrence?.schedule_interval ?? 1))
  const [timezone, setTimezone] = useState(recurrence?.timezone ?? browserTimezone())
  const [date, setDate] = useState(first.date)
  const [time, setTime] = useState(first.time)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate({
      taskId: task.id,
      timezone: timezone.trim(),
      frequency,
      interval: Number(interval),
      firstOccurrenceLocal: `${date} ${time}:00`,
    })
  }

  return (
    <section aria-labelledby="recurrence-title">
      <h3 id="recurrence-title" className="opm-section-title">
        Recurrence
      </h3>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Generate a fresh copy with its tags and reset subtasks on this local schedule.
      </p>
      {!recurrence?.enabled && recurrence && (
        <p role="status" className="mt-2 text-sm text-[var(--danger)]">
          Generation paused because the source became unavailable. Saving re-enables it.
        </p>
      )}
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-[var(--text)]">
          Repeat every
          <span className="mt-1 flex gap-2">
            <input
              aria-label="Recurrence interval"
              className="opm-input w-20"
              type="number"
              min={1}
              max={52}
              value={interval}
              onChange={(event) => setInterval(event.target.value)}
              required
            />
            <select
              aria-label="Recurrence frequency"
              className="opm-select"
              value={frequency}
              onChange={(event) => setFrequency(event.target.value as RecurrenceFrequency)}
            >
              <option value="daily">day(s)</option>
              <option value="weekly">week(s)</option>
              <option value="monthly">month(s)</option>
            </select>
          </span>
        </label>
        <label className="text-sm font-medium text-[var(--text)]">
          Timezone
          <input
            className="opm-input mt-1"
            list="recurrence-timezones"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            required
          />
          <datalist id="recurrence-timezones">
            {COMMON_TIMEZONES.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </label>
        <label className="text-sm font-medium text-[var(--text)]">
          Next occurrence date
          <input
            className="opm-input mt-1"
            type="date"
            min={MIN_TASK_DATE}
            max={MAX_TASK_DATE}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </label>
        <label className="text-sm font-medium text-[var(--text)]">
          Local time
          <input
            className="opm-input mt-1"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            required
          />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button className="opm-btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : recurrence ? 'Update recurrence' : 'Make recurring'}
          </button>
          {recurrence && (
            <button
              type="button"
              className="opm-btn"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? 'Stopping…' : 'Stop recurrence'}
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
