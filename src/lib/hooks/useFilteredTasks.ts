import type { TaskSchedule, TaskSort } from '../../data/tasksRepo'
import { useTaskFilters } from '../../features/toolbar/useTaskFilters'
import { useTasks } from './useTasks'

export interface FilteredTaskOptions {
  sort?: TaskSort
  schedule?: TaskSchedule
  windowStart?: string
  windowEnd?: string
  limit?: number
}

export function useFilteredTasks(workspaceId: string, options: FilteredTaskOptions = {}) {
  const { filters, sort } = useTaskFilters()
  const query = useTasks(workspaceId, {
    status: filters.status,
    priority: filters.priority,
    assignee: filters.assignee,
    type: filters.type,
    tag: filters.tag,
    search: filters.q,
    sort: options.sort ?? sort,
    schedule: options.schedule,
    windowStart: options.windowStart,
    windowEnd: options.windowEnd,
    limit: options.limit,
  })
  const data = query.data?.filter((task) => {
    if (options.schedule === 'gantt') return !!task.start_date && !!task.end_date
    if (options.schedule === 'dated') return !!task.start_date
    if (options.schedule === 'unscheduled') return !task.start_date
    return true
  })
  return { ...query, data }
}
