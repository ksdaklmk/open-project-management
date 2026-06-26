import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type Workspace = Database['public']['Tables']['workspaces']['Row']

export async function listMine(): Promise<Workspace[]> {
  const { data, error } = await supabase.from('workspaces').select('*').order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}
