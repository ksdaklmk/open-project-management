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
    // Seed the cache so navigating straight to the new ref (drawer open on
    // create) never races the refetch into a "Task not found".
    onSuccess: (task) => {
      qc.setQueryData<Task[]>(['tasks', workspaceId], (old) => (old ? [...old, task] : [task]))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      qc.invalidateQueries({ queryKey: ['activity', workspaceId] })
    },
  })
}
