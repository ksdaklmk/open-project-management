import { useQuery } from '@tanstack/react-query'
import { listMine } from '../../data/workspacesRepo'

export function useWorkspaces(enabled = true) {
  return useQuery({ queryKey: ['workspaces'], queryFn: listMine, enabled })
}
