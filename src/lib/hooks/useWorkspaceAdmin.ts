import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createWorkspace,
  updateWorkspace,
  type CreateWorkspaceInput,
} from '../../data/workspacesRepo'

const errorMessage = (error: Error) => toast.error(error.message)

export function useCreateWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => createWorkspace(input),
    onError: errorMessage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
  })
}

export function useUpdateWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ workspaceId, name }: { workspaceId: string; name: string }) =>
      updateWorkspace(workspaceId, name),
    onError: errorMessage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
  })
}
