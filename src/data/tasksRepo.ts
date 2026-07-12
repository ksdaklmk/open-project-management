import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type Task = Database['public']['Tables']['tasks']['Row'] & { tags: string[] }

type TaskRow = Database['public']['Tables']['tasks']['Row'] & { task_tags?: { tag: string }[] }

// PostgREST caps every response at 1,000 rows (config.toml max_rows), so a
// single unpaged read silently truncates larger workspaces. Page until a
// short page; the id tiebreak keeps paging stable across equal positions.
const PAGE = 1000

export async function listTasks(workspaceId: string): Promise<Task[]> {
  const rows: TaskRow[] = []
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, task_tags(tag)')
      .eq('workspace_id', workspaceId)
      .order('position', { ascending: true })
      .order('id', { ascending: true })
      .range(start, start + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as TaskRow[]))
    if ((data?.length ?? 0) < PAGE) break
  }
  return rows.map((r) => {
    const { task_tags, ...row } = r
    return { ...row, tags: (task_tags ?? []).map((t) => t.tag) } as Task
  })
}

export async function updateTask(
  id: string,
  patch: Partial<
    Pick<
      Task,
      | 'status'
      | 'priority'
      | 'assignee_id'
      | 'title'
      | 'position'
      | 'description'
      | 'type'
      | 'points'
      | 'start_date'
      | 'end_date'
    >
  >,
): Promise<void> {
  const { error } = await supabase.from('tasks').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function addTaskTag(taskId: string, tag: string): Promise<void> {
  const { error } = await supabase.from('task_tags').insert({ task_id: taskId, tag })
  if (error) throw new Error(error.message)
}

export async function removeTaskTag(taskId: string, tag: string): Promise<void> {
  const { error } = await supabase.from('task_tags').delete().eq('task_id', taskId).eq('tag', tag)
  if (error) throw new Error(error.message)
}

export interface CreateTaskInput {
  projectId: string
  title: string
}

// Refs are allocated server-side by the create_task RPC (0006): a per-project
// counter under the project row lock, immune to the 1,000-row read cap and to
// concurrent-create collisions. The server pins created_by to the caller and
// derives workspace_id from the project.
export async function createTask({ projectId, title }: CreateTaskInput): Promise<Task> {
  const { data, error } = await supabase.rpc('create_task', {
    p_project_id: projectId,
    p_title: title,
  })
  if (error) throw new Error(error.message)
  return { ...(data as Database['public']['Tables']['tasks']['Row']), tags: [] }
}
