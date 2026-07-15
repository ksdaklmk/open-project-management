import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createTaskDependency,
  deleteTaskDependency,
  listTaskDependencyEdges,
  listTaskDependencies,
} from '../../data/dependenciesRepo'
import { queryTasks } from '../../data/tasksRepo'

export function useTaskDependencies(workspaceId: string, taskId?: string) {
  return useQuery({
    queryKey: ['dependencies', workspaceId, taskId ?? 'all'],
    queryFn: () => listTaskDependencies(workspaceId, taskId),
    enabled: !!workspaceId,
  })
}

export function useTaskDependencyEdges(workspaceId: string, taskIds: string[]) {
  return useQuery({
    queryKey: ['dependencies', workspaceId, 'edges', taskIds],
    queryFn: () => listTaskDependencyEdges(workspaceId, taskIds),
    enabled: !!workspaceId && taskIds.length > 0,
  })
}

export function useDependencyCandidates(workspaceId: string, search = '') {
  return useQuery({
    queryKey: ['dependency-candidates', workspaceId, search],
    queryFn: async () =>
      (
        await queryTasks({
          workspaceId,
          search: search.trim() || undefined,
          sort: 'title',
          limit: 100,
        })
      ).items,
    enabled: !!workspaceId,
  })
}

export function useTaskDependencyMutations(workspaceId: string) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['dependencies', workspaceId] })
    queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
    queryClient.invalidateQueries({ queryKey: ['task', workspaceId] })
  }
  const create = useMutation({
    mutationFn: ({
      predecessorTaskId,
      successorTaskId,
    }: {
      predecessorTaskId: string
      successorTaskId: string
    }) => createTaskDependency(predecessorTaskId, successorTaskId),
    onError: (error: Error) => toast.error(error.message),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: deleteTaskDependency,
    onError: (error: Error) => toast.error(error.message),
    onSuccess: invalidate,
  })
  return { create, remove }
}
