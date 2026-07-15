import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  captureProjectTemplate,
  deleteProjectTemplate,
  instantiateProjectTemplate,
  listProjectTemplates,
} from '../../data/templatesRepo'

export function useProjectTemplates(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = ['project-templates', workspaceId]
  const query = useQuery({
    queryKey: key,
    queryFn: () => listProjectTemplates(workspaceId),
    enabled: !!workspaceId,
  })
  const fail = (error: Error) => toast.error(error.message)

  const capture = useMutation({
    mutationFn: captureProjectTemplate,
    onError: fail,
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: key })
      toast.success(`${template.name} saved as a template.`)
    },
  })
  const instantiate = useMutation({
    mutationFn: instantiateProjectTemplate,
    onError: fail,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['activation', workspaceId] })
      toast.success(`Project created with ${result.taskCount} tasks.`)
    },
  })
  const remove = useMutation({
    mutationFn: deleteProjectTemplate,
    onError: fail,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
      toast.success('Template deleted.')
    },
  })

  return { ...query, capture, instantiate, remove }
}
