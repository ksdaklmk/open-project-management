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
