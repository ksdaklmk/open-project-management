import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type Task = Database['public']['Tables']['tasks']['Row'] & { tags: string[] }

export async function listTasks(workspaceId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, task_tags(tag)')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => {
    const { task_tags, ...row } = r as typeof r & { task_tags?: { tag: string }[] }
    return { ...row, tags: (task_tags ?? []).map((t) => t.tag) } as Task
  })
}

export async function updateTask(
  id: string,
  patch: Partial<
    Pick<
      Task,
      'status' | 'priority' | 'assignee_id' | 'title' | 'position' |
      'description' | 'type' | 'points' | 'start_date' | 'end_date'
    >
  >,
): Promise<void> {
  const { error } = await supabase.from('tasks').update(patch).eq('id', id)
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

// ponytail: client-side ref numbering — reads fresh refs per attempt and
// retries once on a unique-violation race. Ceiling: two same-instant creates
// can still collide twice; upgrade is a DB-side counter RPC (pair it with the
// atomic-move RPC when that lands).
export function nextRef(refs: string[], key: string): string {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${esc}-(\\d+)$`)
  let max = 100 // seed convention: a project's first ref is KEY-101
  for (const r of refs) {
    const m = re.exec(r)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${key}-${max + 1}`
}

export interface CreateTaskInput {
  workspaceId: string
  projectId: string
  projectKey: string
  title: string
  createdBy: string
}

async function insertWithNextRef(input: CreateTaskInput): Promise<Task> {
  const { data: refRows, error: refError } = await supabase
    .from('tasks')
    .select('ref')
    .eq('project_id', input.projectId)
  if (refError) throw new Error(refError.message)
  const ref = nextRef((refRows ?? []).map((r) => r.ref), input.projectKey)
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      ref,
      title: input.title,
      created_by: input.createdBy,
    })
    .select()
    .single()
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return { ...(data as Database['public']['Tables']['tasks']['Row']), tags: [] }
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  try {
    return await insertWithNextRef(input)
  } catch (e) {
    if ((e as { code?: string }).code !== '23505') throw e
    return await insertWithNextRef(input)
  }
}
