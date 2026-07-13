import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type MyWorkScope = 'assigned' | 'overdue' | 'due_soon' | 'recent'
export type MyWorkGroup = 'workspace' | 'project' | 'date'

export interface MyWorkCursor {
  sort: string
  id: string
}

export interface MyWorkItem {
  id: string
  workspaceId: string
  workspaceName: string
  projectId: string
  projectName: string
  projectKey: string
  ref: string
  title: string
  type: Database['public']['Enums']['task_type']
  status: Database['public']['Enums']['task_status']
  priority: Database['public']['Enums']['task_priority']
  startDate: string | null
  endDate: string | null
  points: number | null
  updatedAt: string
  tags: string[]
  sortValue: string
}

export interface MyWorkPage {
  items: MyWorkItem[]
  nextCursor: MyWorkCursor | null
}

interface MyWorkRow {
  id: string
  workspace_id: string
  workspace_name: string
  project_id: string
  project_name: string
  project_key: string
  ref: string
  title: string
  type: MyWorkItem['type']
  status: MyWorkItem['status']
  priority: MyWorkItem['priority']
  start_date: string | null
  end_date: string | null
  points: number | null
  updated_at: string
  tags: string[] | null
  sort_value: string
}

export const MY_WORK_PAGE_SIZE = 100

export async function queryMyWork(
  scope: MyWorkScope,
  cursor: MyWorkCursor | null = null,
  signal?: AbortSignal,
): Promise<MyWorkPage> {
  const request = supabase
    .rpc('query_my_work', {
      p_scope: scope,
      p_cursor_sort: cursor?.sort,
      p_cursor_id: cursor?.id,
      p_limit: MY_WORK_PAGE_SIZE,
    })
    .abortSignal(signal ?? new AbortController().signal)
  const { data, error } = await request
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as MyWorkRow[]
  const hasMore = rows.length > MY_WORK_PAGE_SIZE
  const visible = rows.slice(0, MY_WORK_PAGE_SIZE)
  const items = visible.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    projectId: row.project_id,
    projectName: row.project_name,
    projectKey: row.project_key,
    ref: row.ref,
    title: row.title,
    type: row.type,
    status: row.status,
    priority: row.priority,
    startDate: row.start_date,
    endDate: row.end_date,
    points: row.points,
    updatedAt: row.updated_at,
    tags: row.tags ?? [],
    sortValue: row.sort_value,
  }))
  const last = items[items.length - 1]
  return {
    items,
    nextCursor: hasMore && last ? { sort: last.sortValue, id: last.id } : null,
  }
}
