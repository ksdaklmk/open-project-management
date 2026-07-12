import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { archiveProject, createProject, updateProject } from '../../data/projectsRepo'

export function useProjectAdmin(workspaceId: string) {
  const queryClient = useQueryClient()
  const projectsKey = ['projects', workspaceId]
  const fail = (error: Error) => toast.error(error.message)

  const create = useMutation({
    mutationFn: ({ name, key }: { name: string; key: string }) =>
      createProject(workspaceId, name, key),
    onError: fail,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsKey }),
  })
  const update = useMutation({
    mutationFn: ({ projectId, name }: { projectId: string; name: string }) =>
      updateProject(projectId, name),
    onError: fail,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsKey }),
  })
  const archive = useMutation({
    mutationFn: (projectId: string) => archiveProject(projectId),
    onError: fail,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectsKey })
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
    },
  })

  return { create, update, archive }
}
