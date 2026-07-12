import { STATUSES, type Status } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'

// Buckets by status, preserving input order within each group.
// Ordering is the caller's job (List applies sortTasks first).
export function groupTasksByStatus(tasks: Task[]): { status: Status; tasks: Task[] }[] {
  return STATUSES.map((s) => ({
    status: s.id,
    tasks: tasks.filter((t) => t.status === s.id),
  })).filter((g) => g.tasks.length > 0)
}
