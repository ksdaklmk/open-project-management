import { supabase } from '../lib/supabase'

export interface CommentItem {
  id: string
  body: string
  created_at: string
  author: { name: string } | null
}

export interface CommentCursor {
  createdAt: string
  id: string
}

export interface CommentPage {
  // Newest-first internally; the hook reverses all loaded pages for display.
  items: CommentItem[]
  nextCursor: CommentCursor | null
}

const PAGE_SIZE = 50

export async function listCommentsPage(
  taskId: string,
  cursor: CommentCursor | null = null,
  signal?: AbortSignal,
): Promise<CommentPage> {
  let query = supabase
    .from('comments')
    .select('id, body, created_at, author:profiles!author_id(name)')
    .eq('task_id', taskId)
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
  const items = (data ?? []).slice(0, PAGE_SIZE).map((r) => {
    const row = r as unknown as CommentItem
    return { id: row.id, body: row.body, created_at: row.created_at, author: row.author ?? null }
  })
  const last = items[items.length - 1]
  return {
    items,
    nextCursor: hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
  }
}

export async function addComment(
  taskId: string,
  body: string,
  mentionedUserIds: string[] = [],
): Promise<void> {
  const { error } = await supabase.rpc('create_comment', {
    p_task_id: taskId,
    p_body: body,
    p_mentioned_user_ids: mentionedUserIds,
  })
  if (error) throw new Error(error.message)
}
