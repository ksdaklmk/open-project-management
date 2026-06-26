import { STATUSES, PRIORITIES, type Status } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'

const rankOf = (p: string) => PRIORITIES.find((x) => x.id === p)?.rank ?? 0

export function groupTasksByStatus(tasks: Task[]): { status: Status; tasks: Task[] }[] {
  return STATUSES.map((s) => ({
    status: s.id,
    tasks: tasks
      .filter((t) => t.status === s.id)
      .sort((a, b) => rankOf(b.priority) - rankOf(a.priority) || a.position - b.position),
  })).filter((g) => g.tasks.length > 0)
}
