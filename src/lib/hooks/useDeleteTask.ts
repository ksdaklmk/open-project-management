import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { deleteTask } from '../../data/tasksRepo'

export function useDeleteTask(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onError: (e) => toast.error(`Couldn't delete task: ${(e as Error).message}`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      qc.invalidateQueries({ queryKey: ['task', workspaceId] })
      qc.invalidateQueries({ queryKey: ['workload', workspaceId] })
      qc.invalidateQueries({ queryKey: ['activity', workspaceId] })
      qc.invalidateQueries({ queryKey: ['my-work'] })
    },
  })
}
