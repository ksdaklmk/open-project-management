import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createTask, type Task } from '../../data/tasksRepo'
import { logCreate } from '../../data/activityRepo'
import type { ProjectOption } from '../../data/projectsRepo'
import { useActorId } from './useSession'

export function useCreateTask(workspaceId: string) {
  const qc = useQueryClient()
  const actorId = useActorId()
  return useMutation({
    mutationFn: async ({ title, project }: { title: string; project: ProjectOption }) => {
      const task = await createTask({ projectId: project.id, title })
      try {
        await logCreate({ workspaceId, actorId, taskId: task.id })
      } catch (e) {
        toast.error(`Task created, but activity wasn't logged: ${(e as Error).message}`)
      }
      return task
    },
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
