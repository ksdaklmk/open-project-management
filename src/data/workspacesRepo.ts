import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'
import { throwAdminError } from './adminErrors'

export type Workspace = Database['public']['Tables']['workspaces']['Row']
export interface CreateWorkspaceInput {
  name: string
  initialProjectName: string
  initialProjectKey: string
}
export interface CreatedWorkspace {
  workspaceId: string
  projectId: string
}

export async function listMine(): Promise<Workspace[]> {
  const { data, error } = await supabase.from('workspaces').select('*').order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createWorkspace(input: CreateWorkspaceInput): Promise<CreatedWorkspace> {
  const { data, error } = await supabase.rpc('create_workspace', {
    p_name: input.name,
    p_initial_project_name: input.initialProjectName,
    p_initial_project_key: input.initialProjectKey,
  })
  if (error) throwAdminError(error)
  const created = data?.[0]
  if (!created) throw new Error('Workspace creation returned no result.')
  return { workspaceId: created.workspace_id, projectId: created.project_id }
}

export async function updateWorkspace(workspaceId: string, name: string): Promise<Workspace> {
  const { data, error } = await supabase.rpc('update_workspace', {
    p_workspace_id: workspaceId,
    p_name: name,
  })
  if (error) throwAdminError(error)
  return data
}
