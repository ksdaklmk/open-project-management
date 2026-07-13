import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  getTaskByRef,
  queryTasks,
  queryWorkload,
  type TaskCursor,
  type TaskQuery,
} from '../../data/tasksRepo'

type TaskQueryOptions = Omit<TaskQuery, 'workspaceId' | 'cursor'>

export function useTasks(workspaceId: string, options: TaskQueryOptions = {}) {
  const query = useInfiniteQuery({
    queryKey: ['tasks', workspaceId, 'pages', options],
    queryFn: ({ pageParam, signal }) =>
      queryTasks({ ...options, workspaceId, cursor: pageParam }, signal),
    initialPageParam: null as TaskCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!workspaceId,
  })
  return {
    ...query,
    data: query.data?.pages.flatMap((page) => page.items),
  }
}

export function useTask(workspaceId: string, ref: string) {
  return useQuery({
    queryKey: ['task', workspaceId, ref],
    queryFn: ({ signal }) => getTaskByRef(workspaceId, ref, signal),
    enabled: !!workspaceId && !!ref,
  })
}

export function useWorkload(workspaceId: string, windowStart: string, weekCount = 6) {
  return useQuery({
    queryKey: ['workload', workspaceId, windowStart, weekCount],
    queryFn: ({ signal }) => queryWorkload(workspaceId, windowStart, weekCount, signal),
    enabled: !!workspaceId,
  })
}
