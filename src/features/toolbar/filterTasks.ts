import type { Task } from '../../data/tasksRepo'

export interface TaskFilters {
  status: string[]
  priority: string[]
  assignee: string[]
  type: string[]
  tag: string[]
  q: string
}

export function filterTasks(tasks: Task[], f: TaskFilters): Task[] {
  const q = f.q.trim().toLowerCase()
  return tasks.filter((t) => {
    if (f.status.length && !f.status.includes(t.status)) return false
    if (f.priority.length && !f.priority.includes(t.priority)) return false
    if (f.assignee.length && !f.assignee.includes(t.assignee_id ?? '')) return false
    if (f.type.length && !f.type.includes(t.type)) return false
    if (f.tag.length && !t.tags.some((tg) => f.tag.includes(tg))) return false
    if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q))
      return false
    return true
  })
}
