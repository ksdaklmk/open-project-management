import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { addTaskTag, removeTaskTag, type Task } from '../../data/tasksRepo'

export function useTaskTags(workspaceId: string) {
  const qc = useQueryClient()
  const key = ['tasks', workspaceId]

  const patch = (id: string, fn: (tags: string[]) => string[]) => {
    const prev = qc.getQueryData<Task[]>(key)
    qc.setQueryData<Task[]>(key, (old) =>
      (old ?? []).map((t) => (t.id === id ? { ...t, tags: fn(t.tags) } : t)),
    )
    return prev
  }

  const add = useMutation({
    mutationFn: ({ id, tag }: { id: string; tag: string }) => addTaskTag(id, tag),
    onMutate: async ({ id, tag }) => {
      await qc.cancelQueries({ queryKey: key })
      return { prev: patch(id, (tags) => (tags.includes(tag) ? tags : [...tags, tag])) }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error(`Couldn't add tag: ${(e as Error).message}`)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const remove = useMutation({
    mutationFn: ({ id, tag }: { id: string; tag: string }) => removeTaskTag(id, tag),
    onMutate: async ({ id, tag }) => {
      await qc.cancelQueries({ queryKey: key })
      return { prev: patch(id, (tags) => tags.filter((t) => t !== tag)) }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error(`Couldn't remove tag: ${(e as Error).message}`)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  return { add, remove }
}
