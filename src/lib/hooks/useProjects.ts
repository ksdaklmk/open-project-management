import { useQuery } from '@tanstack/react-query'
import { listProjects } from '../../data/projectsRepo'

export function useProjects(workspaceId: string) {
  return useQuery({
    queryKey: ['projects', workspaceId],
    queryFn: () => listProjects(workspaceId),
    enabled: !!workspaceId,
  })
}
