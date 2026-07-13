import { supabase } from '../lib/supabase'
import type { Database, Json } from '../types/database'

export type SavedViewType = Database['public']['Enums']['saved_view_type']
export type SavedViewVisibility = Database['public']['Enums']['saved_view_visibility']
export type SavedViewGroup = 'status' | 'schedule' | 'date'

export interface SavedViewConfiguration {
  filters: {
    status: string[]
    priority: string[]
    assignee: string[]
    type: string[]
    tag: string[]
    q: string
  }
  sort: 'priority' | 'due' | 'title' | 'status'
  group: SavedViewGroup
}

export interface SavedView {
  id: string
  workspaceId: string
  ownerId: string
  name: string
  viewType: SavedViewType
  configuration: SavedViewConfiguration
  visibility: SavedViewVisibility
  createdAt: string
  updatedAt: string
}

type SavedViewRow = Database['public']['Tables']['saved_views']['Row']

const mapSavedView = (row: SavedViewRow): SavedView => ({
  id: row.id,
  workspaceId: row.workspace_id,
  ownerId: row.owner_id,
  name: row.name,
  viewType: row.view_type,
  // Every persisted row crosses validate_saved_view_configuration. Keeping
  // this cast at the data boundary prevents feature code from handling raw JSON.
  configuration: row.configuration as unknown as SavedViewConfiguration,
  visibility: row.visibility,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const asJson = (configuration: SavedViewConfiguration): Json => configuration as unknown as Json

export async function listSavedViews(
  workspaceId: string,
  viewType: SavedViewType,
): Promise<SavedView[]> {
  const { data, error } = await supabase
    .from('saved_views')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('view_type', viewType)
    .order('name')
    .order('id')
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapSavedView)
}

export async function createSavedView(input: {
  workspaceId: string
  name: string
  viewType: SavedViewType
  configuration: SavedViewConfiguration
  visibility: SavedViewVisibility
}): Promise<SavedView> {
  const { data, error } = await supabase.rpc('create_saved_view', {
    p_workspace_id: input.workspaceId,
    p_name: input.name,
    p_view_type: input.viewType,
    p_configuration: asJson(input.configuration),
    p_visibility: input.visibility,
  })
  if (error) throw new Error(error.message)
  return mapSavedView(data)
}

export async function updateSavedView(input: {
  id: string
  name: string
  configuration: SavedViewConfiguration
  visibility: SavedViewVisibility
}): Promise<SavedView> {
  const { data, error } = await supabase.rpc('update_saved_view', {
    p_saved_view_id: input.id,
    p_name: input.name,
    p_configuration: asJson(input.configuration),
    p_visibility: input.visibility,
  })
  if (error) throw new Error(error.message)
  return mapSavedView(data)
}

export async function duplicateSavedView(id: string, name?: string): Promise<SavedView> {
  const { data, error } = await supabase.rpc('duplicate_saved_view', {
    p_saved_view_id: id,
    ...(name ? { p_name: name } : {}),
  })
  if (error) throw new Error(error.message)
  return mapSavedView(data)
}

export async function deleteSavedView(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_saved_view', { p_saved_view_id: id })
  if (error) throw new Error(error.message)
}

export async function setDefaultSavedView(
  workspaceId: string,
  viewType: SavedViewType,
  savedViewId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('set_default_saved_view', {
    p_workspace_id: workspaceId,
    p_view_type: viewType,
    ...(savedViewId ? { p_saved_view_id: savedViewId } : {}),
  })
  if (error) throw new Error(error.message)
}

export async function getDefaultSavedView(
  workspaceId: string,
  viewType: SavedViewType,
): Promise<SavedView | null> {
  const { data, error } = await supabase.rpc('get_default_saved_view', {
    p_workspace_id: workspaceId,
    p_view_type: viewType,
  })
  if (error) throw new Error(error.message)
  return data?.[0] ? mapSavedView(data[0]) : null
}
