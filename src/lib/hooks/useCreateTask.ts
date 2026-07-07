import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createTask } from '../../data/tasksRepo'
import { logCreate } from '../../data/activityRepo'
import type { ProjectOption } from '../../data/projectsRepo'
import { useSession } from './useSession'

export function useCreateTask(workspaceId: string) {
  const qc = useQueryClient()
  const { session } = useSession()
  return useMutation({
    mutationFn: async ({ title, project }: { title: string; project: ProjectOption }) => {
      const actorId = session?.user.id ?? ''
      const task = await createTask({
        workspaceId,
        projectId: project.id,
        projectKey: project.key,
        title,
        createdBy: actorId,
      })
      try {
        await logCreate({ workspaceId, actorId, taskId: task.id })
      } catch (e) {
        toast.error(`Task created, but activity wasn't logged: ${(e as Error).message}`)
      }
      return task
    },
    onError: (e) => toast.error(`Couldn't create task: ${(e as Error).message}`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      qc.invalidateQueries({ queryKey: ['activity', workspaceId] })
    },
  })
}
