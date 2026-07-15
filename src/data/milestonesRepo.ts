import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type MilestoneStatus = Database['public']['Enums']['milestone_status']
type MilestoneRow = Database['public']['Tables']['project_milestones']['Row']

export interface ProjectMilestone extends MilestoneRow {
  projectName: string
}

type MilestoneWithProject = MilestoneRow & {
  projects: { name: string; archived_at: string | null }
}

export async function listProjectMilestones(workspaceId: string): Promise<ProjectMilestone[]> {
  const { data, error } = await supabase
    .from('project_milestones')
    .select('*, projects!inner(name, archived_at)')
    .eq('workspace_id', workspaceId)
    .is('projects.archived_at', null)
    .order('target_date')
    .order('id')
    .limit(500)
  if (error) throw new Error(error.message)
  return ((data ?? []) as MilestoneWithProject[]).map(({ projects, ...milestone }) => ({
    ...milestone,
    projectName: projects.name,
  }))
}

export async function createProjectMilestone(input: {
  projectId: string
  title: string
  targetDate: string
  status: MilestoneStatus
}): Promise<MilestoneRow> {
  const { data, error } = await supabase.rpc('create_project_milestone', {
    p_project_id: input.projectId,
    p_title: input.title,
    p_target_date: input.targetDate,
    p_status: input.status,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function updateProjectMilestone(input: {
  milestoneId: string
  title: string
  targetDate: string
  status: MilestoneStatus
}): Promise<MilestoneRow> {
  const { data, error } = await supabase.rpc('update_project_milestone', {
    p_milestone_id: input.milestoneId,
    p_title: input.title,
    p_target_date: input.targetDate,
    p_status: input.status,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function deleteProjectMilestone(milestoneId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_project_milestone', {
    p_milestone_id: milestoneId,
  })
  if (error) throw new Error(error.message)
}
