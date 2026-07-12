import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { WorkspaceRealtimeEvent } from '../../data/realtimeRepo'
import type { Task } from '../../data/tasksRepo'

const directWorkspaceKeys: Record<string, (workspaceId: string) => QueryKey[]> = {
  tasks: (workspaceId) => [['tasks', workspaceId]],
  task_tags: (workspaceId) => [['tasks', workspaceId]],
  activity: (workspaceId) => [['activity', workspaceId]],
  projects: (workspaceId) => [
    ['projects', workspaceId],
    ['tasks', workspaceId],
  ],
  workspace_members: (workspaceId) => [
    ['members', workspaceId],
    ['tasks', workspaceId],
    ['workspaces'],
  ],
  workspace_invitations: (workspaceId) => [['invitations', workspaceId]],
}

const rowId = (row: Record<string, unknown>) => (typeof row.id === 'string' ? row.id : null)
const taskIdFrom = (row: Record<string, unknown>) =>
  typeof row.task_id === 'string' ? row.task_id : null

function activeTaskIds(queryClient: QueryClient, workspaceId: string) {
  return new Set((queryClient.getQueryData<Task[]>(['tasks', workspaceId]) ?? []).map((t) => t.id))
}

function findParentFromCachedRows(
  queryClient: QueryClient,
  family: 'comments' | 'subtasks',
  id: string | null,
) {
  if (!id) return null
  for (const [key, rows] of queryClient.getQueriesData<Array<{ id: string }>>({
    queryKey: [family],
  })) {
    if (rows?.some((row) => row.id === id) && typeof key[1] === 'string') return key[1]
  }
  return null
}

export function eventQueryKeys(
  event: WorkspaceRealtimeEvent,
  workspaceId: string,
  queryClient: QueryClient,
): QueryKey[] {
  const record = Object.keys(event.new).length ? event.new : event.old
  if (typeof record.workspace_id === 'string' && record.workspace_id !== workspaceId) return []

  if (event.table !== 'comments' && event.table !== 'subtasks') {
    if (event.table === 'task_tags') {
      const taskId = taskIdFrom(record)
      if (taskId && !activeTaskIds(queryClient, workspaceId).has(taskId)) return []
    }
    return directWorkspaceKeys[event.table]?.(workspaceId) ?? []
  }

  const family = event.table
  const activeIds = activeTaskIds(queryClient, workspaceId)
  const payloadTaskId = taskIdFrom(record)
  const taskId =
    payloadTaskId && activeIds.has(payloadTaskId)
      ? payloadTaskId
      : findParentFromCachedRows(queryClient, family, rowId(record))
  return taskId ? [[family, taskId]] : []
}

export function allWorkspaceQueryKeys(queryClient: QueryClient, workspaceId: string): QueryKey[] {
  const keys: QueryKey[] = [
    ['workspaces'],
    ['tasks', workspaceId],
    ['members', workspaceId],
    ['projects', workspaceId],
    ['activity', workspaceId],
    ['invitations', workspaceId],
  ]
  const taskIds = activeTaskIds(queryClient, workspaceId)
  for (const family of ['comments', 'subtasks'] as const) {
    for (const [key] of queryClient.getQueriesData({ queryKey: [family] })) {
      if (typeof key[1] === 'string' && taskIds.has(key[1])) keys.push(key)
    }
  }
  return keys
}

export function eventFingerprint(event: WorkspaceRealtimeEvent) {
  const record = Object.keys(event.new).length ? event.new : event.old
  const id = rowId(record) ?? taskIdFrom(record) ?? 'unknown'
  return `${event.table}:${event.eventType}:${id}:${event.commitTimestamp ?? ''}`
}
