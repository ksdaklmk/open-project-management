import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

type Status = Database['public']['Enums']['task_status']

export async function logMove(params: {
  workspaceId: string
  actorId: string
  taskId: string
  fromStatus: Status
  toStatus: Status
}): Promise<void> {
  const { error } = await supabase.from('activity').insert({
    workspace_id: params.workspaceId,
    actor_id: params.actorId,
    task_id: params.taskId,
    verb: 'moved',
    from_status: params.fromStatus,
    to_status: params.toStatus,
  })
  if (error) throw new Error(error.message)
}

// ponytail: comment_id omitted — the feed renders "commented on <task>", not a deep link to the comment. Add it when a comment permalink exists.
export async function logComment(params: {
  workspaceId: string
  actorId: string
  taskId: string
}): Promise<void> {
  const { error } = await supabase.from('activity').insert({
    workspace_id: params.workspaceId,
    actor_id: params.actorId,
    task_id: params.taskId,
    verb: 'commented',
  })
  if (error) throw new Error(error.message)
}

export async function logCreate(params: {
  workspaceId: string
  actorId: string
  taskId: string
}): Promise<void> {
  const { error } = await supabase.from('activity').insert({
    workspace_id: params.workspaceId,
    actor_id: params.actorId,
    task_id: params.taskId,
    verb: 'created',
  })
  if (error) throw new Error(error.message)
}

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
      'id, verb, from_status, to_status, created_at, actor:profiles!actor_id(name,color), task:tasks!task_id(ref,title)',
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => {
    const row = r as unknown as ActivityItem
    return {
      id: row.id,
      verb: row.verb,
      from_status: row.from_status,
      to_status: row.to_status,
      created_at: row.created_at,
      actor: row.actor ?? null,
      task: row.task ?? null,
    }
  })
}
