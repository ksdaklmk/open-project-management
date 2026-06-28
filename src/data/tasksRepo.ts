import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type Task = Database['public']['Tables']['tasks']['Row'] & { tags: string[] }

export async function listTasks(workspaceId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, task_tags(tag)')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => {
    const { task_tags, ...row } = r as typeof r & { task_tags?: { tag: string }[] }
    return { ...row, tags: (task_tags ?? []).map((t) => t.tag) } as Task
  })
}

export async function updateTask(
  id: string,
  patch: Partial<
    Pick<
      Task,
      'status' | 'priority' | 'assignee_id' | 'title' | 'position' |
      'description' | 'type' | 'points' | 'start_date' | 'end_date'
    >
  >,
): Promise<void> {
  const { error } = await supabase.from('tasks').update(patch).eq('id', id)
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
