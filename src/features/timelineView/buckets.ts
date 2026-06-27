import { parseDate, startOfWeek, addDays } from '../../lib/weeks'
import type { Task } from '../../data/tasksRepo'

export type BucketId = 'earlier' | 'this_week' | 'next_week' | 'later' | 'unscheduled'

const ORDER: { id: BucketId; label: string }[] = [
  { id: 'earlier', label: 'Earlier' },
  { id: 'this_week', label: 'This week' },
  { id: 'next_week', label: 'Next week' },
  { id: 'later', label: 'Later' },
  { id: 'unscheduled', label: 'Unscheduled' },
]

export function bucketTasks(tasks: Task[], now: Date): { id: BucketId; label: string; tasks: Task[] }[] {
  const monThis = startOfWeek(now)
  const monNext = addDays(monThis, 7)
  const monAfter = addDays(monThis, 14)
  const groups: Record<BucketId, Task[]> = { earlier: [], this_week: [], next_week: [], later: [], unscheduled: [] }

  for (const t of tasks) {
    if (!t.start_date) { groups.unscheduled.push(t); continue }
    const s = parseDate(t.start_date)
    if (s < monThis) groups.earlier.push(t)
    else if (s < monNext) groups.this_week.push(t)
    else if (s < monAfter) groups.next_week.push(t)
    else groups.later.push(t)
  }

  const byStart = (a: Task, b: Task) =>
    (a.start_date ?? '').localeCompare(b.start_date ?? '') || a.ref.localeCompare(b.ref)
  for (const id of Object.keys(groups) as BucketId[]) {
    groups[id].sort(id === 'unscheduled' ? (a, b) => a.ref.localeCompare(b.ref) : byStart)
  }
  return ORDER.map((b) => ({ ...b, tasks: groups[b.id] }))
}
