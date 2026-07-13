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

export interface ActivityCursor {
  createdAt: string
  id: string
}

export interface ActivityPage {
  items: ActivityItem[]
  nextCursor: ActivityCursor | null
}

const PAGE_SIZE = 50

export async function listActivityPage(
  workspaceId: string,
  cursor: ActivityCursor | null = null,
  signal?: AbortSignal,
): Promise<ActivityPage> {
  let query = supabase
    .from('activity')
    .select(
      'id, verb, from_status, to_status, created_at, task_ref_snapshot, task_title_snapshot, actor:profiles!actor_id(name,color), task:tasks!task_id(ref,title)',
    )
    .eq('workspace_id', workspaceId)
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)
    .abortSignal(signal ?? new AbortController().signal)
  if (error) throw new Error(error.message)

  const hasMore = (data?.length ?? 0) > PAGE_SIZE
  const visible = (data ?? []).slice(0, PAGE_SIZE)
  const items = visible.map((r) => {
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
  const last = items[items.length - 1]
  return {
    items,
    nextCursor: hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
  }
}
