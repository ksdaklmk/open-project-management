import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { addTaskTag, removeTaskTag, type Task } from '../../data/tasksRepo'
import { patchTaskCaches, restoreTaskCaches, snapshotTaskCaches } from '../taskCache'

export function useTaskTags(workspaceId: string) {
  const qc = useQueryClient()
  const key = ['tasks', workspaceId]

  const patch = (id: string, fn: (tags: string[]) => string[]) => {
    const prev = snapshotTaskCaches(qc, workspaceId)
    patchTaskCaches(qc, workspaceId, (task) =>
      task.id === id ? ({ ...task, tags: fn(task.tags) } as Task) : task,
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
      if (ctx?.prev) restoreTaskCaches(qc, ctx.prev)
      toast.error(`Couldn't add tag: ${(e as Error).message}`)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['my-work'] })
    },
  })

  const remove = useMutation({
    mutationFn: ({ id, tag }: { id: string; tag: string }) => removeTaskTag(id, tag),
    onMutate: async ({ id, tag }) => {
      await qc.cancelQueries({ queryKey: key })
      return { prev: patch(id, (tags) => tags.filter((t) => t !== tag)) }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) restoreTaskCaches(qc, ctx.prev)
      toast.error(`Couldn't remove tag: ${(e as Error).message}`)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['my-work'] })
    },
  })

  return { add, remove }
}
