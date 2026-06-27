import { useQuery } from '@tanstack/react-query'
import { listActivity } from '../../data/activityRepo'

export function useActivity(workspaceId: string) {
  return useQuery({
    queryKey: ['activity', workspaceId],
    queryFn: () => listActivity(workspaceId),
    enabled: !!workspaceId,
  })
}
