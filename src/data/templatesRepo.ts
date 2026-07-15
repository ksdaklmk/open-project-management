import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'
import { throwAdminError } from './adminErrors'

export interface ProjectTemplateTask {
  key: string
  title: string
  description: string
  type: Database['public']['Enums']['task_type']
  status: Database['public']['Enums']['task_status']
  priority: Database['public']['Enums']['task_priority']
  points: number | null
  start_offset_days: number | null
  end_offset_days: number | null
  tags: string[]
  subtasks: Array<{ title: string }>
  depends_on: string[]
}

export interface ProjectTemplateDefinition {
  project: {
    name: string
    color: string
    capacity_per_week: number
  }
  tasks: ProjectTemplateTask[]
}

type ProjectTemplateRow = Database['public']['Tables']['project_templates']['Row']
export type ProjectTemplate = Omit<ProjectTemplateRow, 'definition'> & {
  definition: ProjectTemplateDefinition
}

export interface TemplateInstantiationResult {
  projectId: string
  taskCount: number
  dependencyCount: number
}

export async function listProjectTemplates(workspaceId: string): Promise<ProjectTemplate[]> {
  const { data, error } = await supabase
    .from('project_templates')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ProjectTemplate[]
}

export async function captureProjectTemplate(input: {
  projectId: string
  name: string
  description: string
  anchorDate: string
  capacityPerWeek: number
}): Promise<ProjectTemplate> {
  const { data, error } = await supabase.rpc('capture_project_template', {
    p_project_id: input.projectId,
    p_name: input.name,
    p_description: input.description,
    p_anchor_date: input.anchorDate,
    p_capacity_per_week: input.capacityPerWeek,
  })
  if (error) throwAdminError(error)
  return data as unknown as ProjectTemplate
}

export async function instantiateProjectTemplate(input: {
  templateId: string
  projectName: string
  projectKey: string
  anchorDate: string
}): Promise<TemplateInstantiationResult> {
  const { data, error } = await supabase.rpc('instantiate_project_template', {
    p_template_id: input.templateId,
    p_project_name: input.projectName,
    p_project_key: input.projectKey,
    p_anchor_date: input.anchorDate,
  })
  if (error) throwAdminError(error)
  const result = data?.[0]
  if (!result) throw new Error('Template generation returned no result.')
  return {
    projectId: result.project_id,
    taskCount: result.task_count,
    dependencyCount: result.dependency_count,
  }
}

export async function deleteProjectTemplate(templateId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_project_template', {
    p_template_id: templateId,
  })
  if (error) throwAdminError(error)
}
