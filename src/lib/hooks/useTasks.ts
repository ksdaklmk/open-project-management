import { useQuery } from '@tanstack/react-query'
import { listTasks } from '../../data/tasksRepo'

export function useTasks(workspaceId: string) {
  return useQuery({
    queryKey: ['tasks', workspaceId],
    queryFn: () => listTasks(workspaceId),
    enabled: !!workspaceId,
  })
}
