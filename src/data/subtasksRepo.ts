import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type Subtask = Database['public']['Tables']['subtasks']['Row']

export async function listSubtasks(taskId: string): Promise<Subtask[]> {
  const { data, error } = await supabase
    .from('subtasks').select('*').eq('task_id', taskId).order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}
export async function addSubtask(taskId: string, title: string, position: number): Promise<void> {
  const { error } = await supabase.from('subtasks').insert({ task_id: taskId, title, position })
  if (error) throw new Error(error.message)
}
export async function toggleSubtask(id: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('subtasks').update({ done }).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function deleteSubtask(id: string): Promise<void> {
  const { error } = await supabase.from('subtasks').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
