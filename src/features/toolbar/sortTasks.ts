import { PRIORITIES, STATUSES } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'

export type SortKey = 'priority' | 'due' | 'title' | 'status'

const rank = (p: string) => PRIORITIES.find((x) => x.id === p)?.rank ?? 0
const stage = (s: string) => { const i = STATUSES.findIndex((x) => x.id === s); return i < 0 ? 99 : i }

export function sortTasks(tasks: Task[], key: SortKey): Task[] {
  const arr = [...tasks]
  switch (key) {
    case 'priority': return arr.sort((a, b) => rank(b.priority) - rank(a.priority))
    case 'due': return arr.sort((a, b) => (a.end_date ?? '9999-12-31').localeCompare(b.end_date ?? '9999-12-31'))
    case 'title': return arr.sort((a, b) => a.title.localeCompare(b.title))
    case 'status': return arr.sort((a, b) => stage(a.status) - stage(b.status))
  }
}
