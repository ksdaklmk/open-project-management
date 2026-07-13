import { supabase } from '../lib/supabase'

export type ActivationSignal = 'member_active' | 'workload_viewed' | 'gantt_viewed'

export interface ActivationStatus {
  workspaceCreated: boolean
  projectCreated: boolean
  taskCount: number
  invitationSent: boolean
  secondMemberActive: boolean
  coreViewOpened: boolean
  checklistComplete: boolean
  activatedWithin7Days: boolean
  dismissed: boolean
}

interface ActivationStatusRow {
  workspace_created: boolean
  project_created: boolean
  task_count: number
  invitation_sent: boolean
  second_member_active: boolean
  core_view_opened: boolean
  checklist_complete: boolean
  activated_within_7_days: boolean
  dismissed: boolean
}

export async function getActivationStatus(workspaceId: string): Promise<ActivationStatus> {
  const { data, error } = await supabase.rpc('get_activation_status', {
    p_workspace_id: workspaceId,
  })
  if (error) throw new Error(error.message)
  const row = (data?.[0] ?? null) as ActivationStatusRow | null
  if (!row) throw new Error('Activation status returned no result.')
  return {
    workspaceCreated: row.workspace_created,
    projectCreated: row.project_created,
    taskCount: row.task_count,
    invitationSent: row.invitation_sent,
    secondMemberActive: row.second_member_active,
    coreViewOpened: row.core_view_opened,
    checklistComplete: row.checklist_complete,
    activatedWithin7Days: row.activated_within_7_days,
    dismissed: row.dismissed,
  }
}

export async function recordActivationSignal(
  workspaceId: string,
  eventName: ActivationSignal,
): Promise<void> {
  const { error } = await supabase.rpc('record_activation_signal', {
    p_workspace_id: workspaceId,
    p_event_name: eventName,
  })
  if (error) throw new Error(error.message)
}

export async function dismissOnboarding(workspaceId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('onboarding_dismissals')
    .upsert({ workspace_id: workspaceId, user_id: userId }, { onConflict: 'workspace_id,user_id' })
  if (error) throw new Error(error.message)
}
