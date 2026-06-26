import { STATUSES, type Status } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'

export function boardColumns(tasks: Task[]): { status: Status; tasks: Task[] }[] {
  return STATUSES.map((s) => ({
    status: s.id,
    tasks: tasks.filter((t) => t.status === s.id).sort((a, b) => a.position - b.position),
  }))
}
