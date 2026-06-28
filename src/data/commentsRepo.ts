import { supabase } from '../lib/supabase'

export interface CommentItem {
  id: string
  body: string
  created_at: string
  author: { name: string } | null
}

export async function listComments(taskId: string): Promise<CommentItem[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, body, created_at, author:profiles!author_id(name)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => {
    const row = r as unknown as CommentItem
    return { id: row.id, body: row.body, created_at: row.created_at, author: row.author ?? null }
  })
}

export async function addComment(taskId: string, body: string, authorId: string): Promise<void> {
  const { error } = await supabase.from('comments').insert({ task_id: taskId, body, author_id: authorId })
  if (error) throw new Error(error.message)
}
