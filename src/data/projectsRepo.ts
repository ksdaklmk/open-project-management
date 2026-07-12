import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'
import { throwAdminError } from './adminErrors'

export type Project = Database['public']['Tables']['projects']['Row']

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
    .is('archived_at', null)
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createProject(
  workspaceId: string,
  name: string,
  key: string,
): Promise<Project> {
  const { data, error } = await supabase.rpc('create_project', {
    p_workspace_id: workspaceId,
    p_name: name,
    p_key: key,
  })
  if (error) throwAdminError(error)
  return data
}

export async function updateProject(projectId: string, name: string): Promise<Project> {
  const { data, error } = await supabase.rpc('update_project', {
    p_project_id: projectId,
    p_name: name,
  })
  if (error) throwAdminError(error)
  return data
}

export async function archiveProject(projectId: string): Promise<Project> {
  const { data, error } = await supabase.rpc('archive_project', { p_project_id: projectId })
  if (error) throwAdminError(error)
  return data
}
