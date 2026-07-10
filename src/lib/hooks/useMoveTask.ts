import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { updateTask, type Task } from '../../data/tasksRepo'
import { logMove } from '../../data/activityRepo'
import { useActorId } from './useSession'

interface MoveArgs {
  taskId: string
  toStatus: Task['status']
  position: number
  fromStatus: Task['status']
}

export function useMoveTask(workspaceId: string) {
  const qc = useQueryClient()
  const actorId = useActorId()
  const key = ['tasks', workspaceId]
  return useMutation({
    mutationFn: async ({ taskId, toStatus, position, fromStatus }: MoveArgs) => {
      await updateTask(taskId, { status: toStatus, position })
      if (toStatus !== fromStatus) {
        try {
          await logMove({ workspaceId, actorId, taskId, fromStatus, toStatus })
        } catch (e) {
          toast.error(`Move saved, but activity wasn't logged: ${(e as Error).message}`)
        }
      }
    },
    onMutate: async ({ taskId, toStatus, position }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Task[]>(key)
      qc.setQueryData<Task[]>(key, (old) =>
        (old ?? []).map((t) => (t.id === taskId ? { ...t, status: toStatus, position } : t)))
      return { prev }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error(`Move failed: ${(err as Error).message}`)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['activity', workspaceId] })
    },
  })
}
