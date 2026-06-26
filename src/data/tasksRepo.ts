import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type Task = Database['public']['Tables']['tasks']['Row']

export async function listTasks(workspaceId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function updateTask(
  id: string,
  patch: Partial<Pick<Task, 'status' | 'priority' | 'assignee_id' | 'title'>>,
): Promise<void> {
  const { error } = await supabase.from('tasks').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}
