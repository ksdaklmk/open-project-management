import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query'
import type { Task, TaskCursor, TaskPage } from '../data/tasksRepo'

export type TaskCacheSnapshot = Array<[QueryKey, unknown]>

function isTask(value: unknown): value is Task {
  return !!value && typeof value === 'object' && typeof (value as Task).id === 'string'
}

function isTaskPages(value: unknown): value is InfiniteData<TaskPage, TaskCursor | null> {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray((value as InfiniteData<TaskPage, TaskCursor | null>).pages)
  )
}

export function snapshotTaskCaches(queryClient: QueryClient, workspaceId: string) {
  return [
    ...queryClient.getQueriesData({ queryKey: ['tasks', workspaceId] }),
    ...queryClient.getQueriesData({ queryKey: ['task', workspaceId] }),
  ]
}

export function restoreTaskCaches(queryClient: QueryClient, snapshot: TaskCacheSnapshot) {
  for (const [key, value] of snapshot) queryClient.setQueryData(key, value)
}

export function patchTaskCaches(
  queryClient: QueryClient,
  workspaceId: string,
  patch: (task: Task) => Task,
) {
  queryClient.setQueriesData({ queryKey: ['tasks', workspaceId] }, (old: unknown) => {
    if (Array.isArray(old)) return old.map((task) => (isTask(task) ? patch(task) : task))
    if (!isTaskPages(old)) return old
    return {
      ...old,
      pages: old.pages.map((page) => ({ ...page, items: page.items.map(patch) })),
    }
  })
  queryClient.setQueriesData({ queryKey: ['task', workspaceId] }, (old: unknown) =>
    isTask(old) ? patch(old) : old,
  )
}

export function cachedTasks(queryClient: QueryClient, workspaceId: string): Task[] {
  const tasks = new Map<string, Task>()
  for (const [, value] of queryClient.getQueriesData({ queryKey: ['tasks', workspaceId] })) {
    if (Array.isArray(value)) {
      for (const task of value) if (isTask(task)) tasks.set(task.id, task)
    } else if (isTaskPages(value)) {
      for (const page of value.pages) for (const task of page.items) tasks.set(task.id, task)
    }
  }
  return [...tasks.values()]
}
