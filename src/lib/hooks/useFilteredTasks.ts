import { useTasks } from './useTasks'
import { useTaskFilters } from '../../features/toolbar/useTaskFilters'
import { filterTasks } from '../../features/toolbar/filterTasks'

export function useFilteredTasks(workspaceId: string) {
  const q = useTasks(workspaceId)
  const { filters } = useTaskFilters()
  return { ...q, data: q.data ? filterTasks(q.data, filters) : q.data }
}
