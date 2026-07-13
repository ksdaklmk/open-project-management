import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type Task = Database['public']['Tables']['tasks']['Row'] & { tags: string[] }
type Status = Database['public']['Enums']['task_status']
type Priority = Database['public']['Enums']['task_priority']
type TaskType = Database['public']['Enums']['task_type']

export type TaskSort = 'position' | 'priority' | 'due' | 'title' | 'status'
export type TaskSchedule = 'any' | 'gantt' | 'dated' | 'unscheduled'

export interface TaskCursor {
  sort: string
  id: string
}

export interface TaskQuery {
  workspaceId: string
  status?: string[]
  priority?: string[]
  assignee?: string[]
  type?: string[]
  tag?: string[]
  search?: string
  sort?: TaskSort
  cursor?: TaskCursor | null
  windowStart?: string
  windowEnd?: string
  schedule?: TaskSchedule
  limit?: number
}

export interface TaskPage {
  items: Task[]
  nextCursor: TaskCursor | null
}

type QueryTaskRow = Database['public']['Tables']['tasks']['Row'] & {
  tags: string[] | null
  sort_value: string
}

export const TASK_PAGE_SIZE = 200

export async function queryTasks(query: TaskQuery, signal?: AbortSignal): Promise<TaskPage> {
  const limit = Math.min(Math.max(query.limit ?? TASK_PAGE_SIZE, 1), 500)
  const assignees = (query.assignee ?? []).filter(Boolean)
  const request = supabase
    .rpc('query_tasks', {
      p_workspace_id: query.workspaceId,
      p_status: query.status?.length ? (query.status as Status[]) : undefined,
      p_priority: query.priority?.length ? (query.priority as Priority[]) : undefined,
      p_assignee: assignees.length || query.assignee?.includes('') ? assignees : undefined,
      p_include_unassigned: query.assignee?.includes('') ?? false,
      p_type: query.type?.length ? (query.type as TaskType[]) : undefined,
      p_tags: query.tag?.length ? query.tag : undefined,
      p_search: query.search?.trim() || undefined,
      p_sort: query.sort ?? 'position',
      p_cursor_sort: query.cursor?.sort,
      p_cursor_id: query.cursor?.id,
      p_window_start: query.windowStart,
      p_window_end: query.windowEnd,
      p_schedule: query.schedule ?? 'any',
      p_limit: limit,
    })
    .abortSignal(signal ?? new AbortController().signal)
  const { data, error } = await request
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as QueryTaskRow[]
  const hasMore = rows.length > limit
  const visible = rows.slice(0, limit)
  const items = visible.map(({ sort_value: _sortValue, tags, ...task }) => ({
    ...task,
    tags: tags ?? [],
  }))
  const last = visible[visible.length - 1]
  return {
    items,
    nextCursor: hasMore && last ? { sort: last.sort_value, id: last.id } : null,
  }
}

export async function getTaskByRef(
  workspaceId: string,
  ref: string,
  signal?: AbortSignal,
): Promise<Task | null> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, task_tags(tag)')
    .eq('workspace_id', workspaceId)
    .eq('ref', ref)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const { task_tags, ...task } = data as typeof data & { task_tags?: Array<{ tag: string }> }
  return { ...task, tags: (task_tags ?? []).map((item) => item.tag) } as Task
}

export interface WorkloadPoint {
  assigneeId: string | null
  weekStart: string | null
  points: number
  bucket: 'scheduled' | 'unscheduled' | 'out_of_range'
}

export async function queryWorkload(
  workspaceId: string,
  windowStart: string,
  weekCount = 6,
  signal?: AbortSignal,
): Promise<WorkloadPoint[]> {
  const { data, error } = await supabase
    .rpc('query_workload', {
      p_workspace_id: workspaceId,
      p_window_start: windowStart,
      p_week_count: weekCount,
    })
    .abortSignal(signal ?? new AbortController().signal)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    assigneeId: row.assignee_id,
    weekStart: row.week_start,
    points: Number(row.points),
    bucket: row.bucket as WorkloadPoint['bucket'],
  }))
}

export async function updateTask(
  id: string,
  patch: Partial<
    Pick<
      Task,
      | 'status'
      | 'priority'
      | 'assignee_id'
      | 'title'
      | 'position'
      | 'description'
      | 'type'
      | 'points'
      | 'start_date'
      | 'end_date'
    >
  >,
): Promise<void> {
  const { error } = await supabase.from('tasks').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export class TaskMoveConflict extends Error {
  readonly retryable = true

  constructor(message = 'Task ordering changed. Refresh and retry.') {
    super(message)
    this.name = 'TaskMoveConflict'
  }
}

export async function moveTask(
  taskId: string,
  toStatus: Task['status'],
  beforeTaskId: string | null,
  afterTaskId: string | null,
): Promise<Task> {
  const { data, error } = await supabase.rpc('move_task', {
    p_task_id: taskId,
    p_to_status: toStatus,
    p_before_task_id: beforeTaskId ?? undefined,
    p_after_task_id: afterTaskId ?? undefined,
  })
  if (error?.code === '40001') throw new TaskMoveConflict()
  if (error) throw new Error(error.message)
  return { ...data, tags: [] }
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function addTaskTag(taskId: string, tag: string): Promise<void> {
  const { error } = await supabase.from('task_tags').insert({ task_id: taskId, tag })
  if (error) throw new Error(error.message)
}

export async function removeTaskTag(taskId: string, tag: string): Promise<void> {
  const { error } = await supabase.from('task_tags').delete().eq('task_id', taskId).eq('tag', tag)
  if (error) throw new Error(error.message)
}

export interface CreateTaskInput {
  projectId: string
  title: string
}

export async function createTask({ projectId, title }: CreateTaskInput): Promise<Task> {
  const { data, error } = await supabase.rpc('create_task', {
    p_project_id: projectId,
    p_title: title,
  })
  if (error) throw new Error(error.message)
  return { ...(data as Database['public']['Tables']['tasks']['Row']), tags: [] }
}
