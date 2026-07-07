import { supabase } from '../lib/supabase'

export interface ProjectOption {
  id: string
  name: string
  key: string
}

export async function listProjects(workspaceId: string): Promise<ProjectOption[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, key')
    .eq('workspace_id', workspaceId)
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}
