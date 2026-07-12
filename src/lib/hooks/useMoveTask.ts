import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { updateTask, type Task } from '../../data/tasksRepo'

interface MoveArgs {
  taskId: string
  toStatus: Task['status']
  position: number
  fromStatus: Task['status']
}

export function useMoveTask(workspaceId: string) {
  const qc = useQueryClient()
  const key = ['tasks', workspaceId]
  return useMutation({
    mutationFn: ({ taskId, toStatus, position }: MoveArgs) =>
      updateTask(taskId, { status: toStatus, position }),
    onMutate: async ({ taskId, toStatus, position }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Task[]>(key)
      qc.setQueryData<Task[]>(key, (old) =>
        (old ?? []).map((t) => (t.id === taskId ? { ...t, status: toStatus, position } : t)),
      )
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
