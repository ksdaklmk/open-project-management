import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type RecurrenceFrequency = Database['public']['Enums']['recurrence_frequency']
export type TaskRecurrence = Database['public']['Tables']['task_recurrences']['Row']

export async function getTaskRecurrence(taskId: string): Promise<TaskRecurrence | null> {
  const { data, error } = await supabase
    .from('task_recurrences')
    .select('*')
    .eq('source_task_id', taskId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function saveTaskRecurrence(input: {
  taskId: string
  timezone: string
  frequency: RecurrenceFrequency
  interval: number
  firstOccurrenceLocal: string
}): Promise<TaskRecurrence> {
  const { data, error } = await supabase.rpc('upsert_task_recurrence', {
    p_task_id: input.taskId,
    p_timezone: input.timezone,
    p_frequency: input.frequency,
    p_interval: input.interval,
    p_first_occurrence_local: input.firstOccurrenceLocal,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function removeTaskRecurrence(taskId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_task_recurrence', { p_task_id: taskId })
  if (error) throw new Error(error.message)
}
