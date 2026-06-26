import { useQuery } from '@tanstack/react-query'
import { listMembers } from '../../data/membersRepo'

export function useMembers(workspaceId: string) {
  return useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => listMembers(workspaceId),
    enabled: !!workspaceId,
  })
}
