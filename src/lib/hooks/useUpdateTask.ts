import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { updateTask, type Task } from '../../data/tasksRepo'

type Patch = Parameters<typeof updateTask>[1]

export function useUpdateTask(workspaceId: string) {
  const qc = useQueryClient()
  const key = ['tasks', workspaceId]
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Patch }) => updateTask(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Task[]>(key)
      qc.setQueryData<Task[]>(key, (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
      )
      return { prev }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error(`Update failed: ${(err as Error).message}`)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}
