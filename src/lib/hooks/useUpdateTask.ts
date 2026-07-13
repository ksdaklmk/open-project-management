import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { updateTask, type Task } from '../../data/tasksRepo'
import { patchTaskCaches, restoreTaskCaches, snapshotTaskCaches } from '../taskCache'

type Patch = Parameters<typeof updateTask>[1]

export function useUpdateTask(workspaceId: string) {
  const qc = useQueryClient()
  const key = ['tasks', workspaceId]
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Patch }) => updateTask(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = snapshotTaskCaches(qc, workspaceId)
      patchTaskCaches(qc, workspaceId, (task) =>
        task.id === id ? ({ ...task, ...patch } as Task) : task,
      )
      return { prev }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) restoreTaskCaches(qc, ctx.prev)
      toast.error(`Update failed: ${(err as Error).message}`)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['task', workspaceId] })
      qc.invalidateQueries({ queryKey: ['workload', workspaceId] })
      qc.invalidateQueries({ queryKey: ['activity', workspaceId] })
      qc.invalidateQueries({ queryKey: ['my-work'] })
    },
  })
}
