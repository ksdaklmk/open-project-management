import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getTaskRecurrence,
  removeTaskRecurrence,
  saveTaskRecurrence,
} from '../../data/recurrencesRepo'

export function useTaskRecurrence(taskId: string, workspaceId: string) {
  const queryClient = useQueryClient()
  const key = ['task-recurrence', taskId]
  const query = useQuery({
    queryKey: key,
    queryFn: () => getTaskRecurrence(taskId),
    enabled: !!taskId,
  })
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key })
    queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
    queryClient.invalidateQueries({ queryKey: ['task', workspaceId] })
  }
  const save = useMutation({
    mutationFn: saveTaskRecurrence,
    onSuccess: () => {
      invalidate()
      toast.success('Recurrence saved.')
    },
    onError: (error) => toast.error(`Couldn't save recurrence: ${(error as Error).message}`),
  })
  const remove = useMutation({
    mutationFn: () => removeTaskRecurrence(taskId),
    onSuccess: () => {
      invalidate()
      toast.success('Recurrence stopped.')
    },
    onError: (error) => toast.error(`Couldn't stop recurrence: ${(error as Error).message}`),
  })

  return { ...query, save, remove }
}
