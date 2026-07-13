import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type NotificationKind = Database['public']['Enums']['notification_kind']

export interface NotificationCursor {
  createdAt: string
  id: string
}

export interface NotificationItem {
  id: string
  workspaceId: string
  actorId: string | null
  kind: NotificationKind
  taskId: string | null
  taskRef: string | null
  commentId: string | null
  invitationId: string | null
  createdAt: string
  readAt: string | null
}

export interface NotificationPage {
  items: NotificationItem[]
  nextCursor: NotificationCursor | null
}

interface InboxRow {
  id: string
  workspace_id: string
  actor_id: string | null
  kind: NotificationKind
  task_id: string | null
  task_ref: string | null
  comment_id: string | null
  invitation_id: string | null
  created_at: string
  read_at: string | null
}

export const INBOX_PAGE_SIZE = 50

export async function queryInbox(
  cursor: NotificationCursor | null = null,
  signal?: AbortSignal,
): Promise<NotificationPage> {
  const { data, error } = await supabase
    .rpc('query_inbox', {
      p_cursor_created_at: cursor?.createdAt,
      p_cursor_id: cursor?.id,
      p_limit: INBOX_PAGE_SIZE,
    })
    .abortSignal(signal ?? new AbortController().signal)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as InboxRow[]
  const hasMore = rows.length > INBOX_PAGE_SIZE
  const items = rows.slice(0, INBOX_PAGE_SIZE).map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    actorId: row.actor_id,
    kind: row.kind,
    taskId: row.task_id,
    taskRef: row.task_ref,
    commentId: row.comment_id,
    invitationId: row.invitation_id,
    createdAt: row.created_at,
    readAt: row.read_at,
  }))
  const last = items[items.length - 1]
  return {
    items,
    nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
  }
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_unread_notification_count')
  if (error) throw new Error(error.message)
  return data ?? 0
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('notification_reads')
    .upsert(
      { notification_id: notificationId, user_id: userId },
      { onConflict: 'notification_id,user_id', ignoreDuplicates: true },
    )
  if (error) throw new Error(error.message)
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data, error } = await supabase.rpc('mark_all_notifications_read')
  if (error) throw new Error(error.message)
  return data ?? 0
}

export type NotificationPreferences = Omit<
  Database['public']['Tables']['notification_preferences']['Row'],
  'updated_at'
>

export const defaultNotificationPreferences = (userId: string): NotificationPreferences => ({
  user_id: userId,
  assignments: true,
  mentions: true,
  watched_comments: true,
  status_changes: true,
  invitations: true,
  due_soon: true,
  email_enabled: false,
})

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select(
      'user_id, assignments, mentions, watched_comments, status_changes, invitations, due_soon, email_enabled',
    )
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ?? defaultNotificationPreferences(userId)
}

export async function updateNotificationPreferences(
  userId: string,
  patch: Partial<Omit<NotificationPreferences, 'user_id'>>,
): Promise<NotificationPreferences> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
    .select(
      'user_id, assignments, mentions, watched_comments, status_changes, invitations, due_soon, email_enabled',
    )
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function isTaskWatched(taskId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_task_watched', { p_task_id: taskId })
  if (error) throw new Error(error.message)
  return data
}

export async function setTaskWatched(taskId: string, watching: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_task_watched', {
    p_task_id: taskId,
    p_watching: watching,
  })
  if (error) throw new Error(error.message)
  return data
}
