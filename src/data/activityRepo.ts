import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

type Status = Database['public']['Enums']['task_status']

export interface ActivityItem {
  id: string
  verb: string
  from_status: Status | null
  to_status: Status | null
  created_at: string
  actor: { name: string; color: string } | null
  task: { ref: string; title: string } | null
}

export async function listActivity(workspaceId: string): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from('activity')
    .select(
      'id, verb, from_status, to_status, created_at, task_ref_snapshot, task_title_snapshot, actor:profiles!actor_id(name,color), task:tasks!task_id(ref,title)',
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => {
    const row = r as unknown as ActivityItem & {
      task_ref_snapshot: string | null
      task_title_snapshot: string | null
    }
    return {
      id: row.id,
      verb: row.verb,
      from_status: row.from_status,
      to_status: row.to_status,
      created_at: row.created_at,
      actor: row.actor ?? null,
      task:
        row.task ??
        (row.task_ref_snapshot && row.task_title_snapshot
          ? { ref: row.task_ref_snapshot, title: row.task_title_snapshot }
          : null),
    }
  })
}
