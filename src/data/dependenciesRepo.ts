import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

type TaskStatus = Database['public']['Enums']['task_status']

export interface TaskDependency {
  id: string
  workspaceId: string
  predecessor: DependencyTask
  successor: DependencyTask
}

export interface DependencyTask {
  id: string
  ref: string
  title: string
  status: TaskStatus
  startDate: string | null
  endDate: string | null
}

export interface TaskDependencyEdge {
  id: string
  predecessor: { id: string }
  successor: { id: string }
}

export async function listTaskDependencies(
  workspaceId: string,
  taskId?: string,
): Promise<TaskDependency[]> {
  const { data, error } = await supabase.rpc('query_task_dependencies', {
    p_workspace_id: workspaceId,
    p_task_id: taskId,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    predecessor: {
      id: row.predecessor_task_id,
      ref: row.predecessor_ref,
      title: row.predecessor_title,
      status: row.predecessor_status,
      startDate: row.predecessor_start_date || null,
      endDate: row.predecessor_end_date || null,
    },
    successor: {
      id: row.successor_task_id,
      ref: row.successor_ref,
      title: row.successor_title,
      status: row.successor_status,
      startDate: row.successor_start_date || null,
      endDate: row.successor_end_date || null,
    },
  }))
}

export async function listTaskDependencyEdges(
  workspaceId: string,
  taskIds: string[],
): Promise<TaskDependencyEdge[]> {
  if (taskIds.length === 0) return []
  const { data, error } = await supabase
    .from('task_dependencies')
    .select('id, predecessor_task_id, successor_task_id')
    .eq('workspace_id', workspaceId)
    .in('predecessor_task_id', taskIds.slice(0, 500))
  if (error) throw new Error(error.message)
  const visible = new Set(taskIds)
  return (data ?? [])
    .filter((row) => visible.has(row.successor_task_id))
    .map((row) => ({
      id: row.id,
      predecessor: { id: row.predecessor_task_id },
      successor: { id: row.successor_task_id },
    }))
}

export async function createTaskDependency(
  predecessorTaskId: string,
  successorTaskId: string,
): Promise<void> {
  const { error } = await supabase.rpc('create_task_dependency', {
    p_predecessor_task_id: predecessorTaskId,
    p_successor_task_id: successorTaskId,
  })
  if (error) throw new Error(error.message)
}

export async function deleteTaskDependency(dependencyId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_task_dependency', {
    p_dependency_id: dependencyId,
  })
  if (error) throw new Error(error.message)
}
