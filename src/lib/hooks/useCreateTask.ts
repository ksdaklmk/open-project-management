import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createTask, type Task } from '../../data/tasksRepo'
import type { ProjectOption } from '../../data/projectsRepo'

export function useCreateTask(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ title, project }: { title: string; project: ProjectOption }) =>
      createTask({ projectId: project.id, title }),
    onError: (e) => toast.error(`Couldn't create task: ${(e as Error).message}`),
    onSuccess: (task) => {
      // The drawer has its own stable-ID query, so seed that bounded cache.
      qc.setQueryData<Task>(['task', workspaceId, task.ref], task)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      qc.invalidateQueries({ queryKey: ['workload', workspaceId] })
      qc.invalidateQueries({ queryKey: ['activity', workspaceId] })
      qc.invalidateQueries({ queryKey: ['activation', workspaceId] })
      qc.invalidateQueries({ queryKey: ['my-work'] })
    },
  })
}
