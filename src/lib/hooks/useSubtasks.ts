import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listSubtasks, addSubtask, toggleSubtask, deleteSubtask, type Subtask } from '../../data/subtasksRepo'

export function useSubtasks(taskId: string) {
  const qc = useQueryClient()
  const key = ['subtasks', taskId]
  const query = useQuery({ queryKey: key, queryFn: () => listSubtasks(taskId), enabled: !!taskId })

  const add = useMutation({
    mutationFn: (title: string) => addSubtask(taskId, title, qc.getQueryData<Subtask[]>(key)?.length ?? 0),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const optimistic = <V,>(apply: (rows: Subtask[], v: V) => Subtask[]) => ({
    onMutate: async (v: V) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Subtask[]>(key)
      qc.setQueryData<Subtask[]>(key, (old) => apply(old ?? [], v))
      return { prev }
    },
    onError: (e: unknown, _v: V, ctx: { prev?: Subtask[] } | undefined) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error(`Couldn't update subtask: ${(e as Error).message}`)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => toggleSubtask(id, done),
    ...optimistic<{ id: string; done: boolean }>((rows, { id, done }) =>
      rows.map((s) => (s.id === id ? { ...s, done } : s))),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteSubtask(id),
    ...optimistic<string>((rows, id) => rows.filter((s) => s.id !== id)),
  })

  return { ...query, add, toggle, remove }
}
