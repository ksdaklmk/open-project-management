import { useQuery } from '@tanstack/react-query'
import { listMine } from '../../data/workspacesRepo'

export function useWorkspaces() {
  return useQuery({ queryKey: ['workspaces'], queryFn: listMine })
}
