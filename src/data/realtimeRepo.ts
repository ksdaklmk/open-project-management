import { supabase } from '../lib/supabase'

export type RealtimeTable =
  | 'tasks'
  | 'task_tags'
  | 'subtasks'
  | 'comments'
  | 'activity'
  | 'workspace_members'
  | 'projects'
  | 'workspace_invitations'
  | 'notifications'
  | 'notification_reads'
  | 'project_milestones'
  | 'task_dependencies'

export interface WorkspaceRealtimeEvent {
  table: RealtimeTable
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
  old: Record<string, unknown>
  commitTimestamp?: string
}

export type WorkspaceRealtimeStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'

const WORKSPACE_TABLES: RealtimeTable[] = [
  'tasks',
  'activity',
  'workspace_members',
  'projects',
  'workspace_invitations',
  'project_milestones',
  'task_dependencies',
]
const CHILD_TABLES: RealtimeTable[] = ['task_tags', 'subtasks', 'comments']
const PERSONAL_TABLES: RealtimeTable[] = ['notifications', 'notification_reads']

export function subscribeToWorkspace(
  workspaceId: string,
  onEvent: (event: WorkspaceRealtimeEvent) => void,
  onStatus: (status: WorkspaceRealtimeStatus) => void,
) {
  const channel = supabase.channel(`workspace:${workspaceId}`)
  for (const table of WORKSPACE_TABLES) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `workspace_id=eq.${workspaceId}` },
      (payload) =>
        onEvent({
          table,
          eventType: payload.eventType,
          new: payload.new,
          old: payload.old,
          commitTimestamp: payload.commit_timestamp,
        }),
    )
  }
  // Child rows are authorized through their task by RLS and lack a workspace
  // column. The provider accepts them only when their task is in the active
  // workspace cache, then invalidates that one parent query.
  for (const table of CHILD_TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) =>
      onEvent({
        table,
        eventType: payload.eventType,
        new: payload.new,
        old: payload.old,
        commitTimestamp: payload.commit_timestamp,
      }),
    )
  }
  // Personal notification tables are unfiltered here because their RLS
  // policies expose only the signed-in recipient's rows across workspaces.
  for (const table of PERSONAL_TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) =>
      onEvent({
        table,
        eventType: payload.eventType,
        new: payload.new,
        old: payload.old,
        commitTimestamp: payload.commit_timestamp,
      }),
    )
  }
  channel.subscribe((status) => onStatus(status))
  return () => {
    void supabase.removeChannel(channel)
  }
}
