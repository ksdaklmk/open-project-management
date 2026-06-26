import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export interface Member {
  user_id: string
  role: Database['public']['Enums']['member_role']
  capacity_per_week: number
  color: string
  name: string
}

export async function listMembers(workspaceId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('user_id, role, capacity_per_week, color, profiles(name)')
    .eq('workspace_id', workspaceId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((m) => {
    const profile = m.profiles as { name: string } | null
    return {
      user_id: m.user_id,
      role: m.role,
      capacity_per_week: m.capacity_per_week,
      color: m.color,
      name: profile?.name ?? '',
    }
  })
}
