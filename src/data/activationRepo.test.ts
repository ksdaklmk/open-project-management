import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissOnboarding, getActivationStatus, recordActivationSignal } from './activationRepo'

const { rpc, from, upsert } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ supabase: { rpc, from } }))

describe('activationRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    from.mockReturnValue({ upsert })
  })

  it('maps the privacy-safe activation aggregate', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          workspace_created: true,
          project_created: true,
          task_count: 3,
          invitation_sent: false,
          second_member_active: false,
          core_view_opened: true,
          checklist_complete: false,
          activated_within_7_days: false,
          dismissed: false,
        },
      ],
      error: null,
    })

    await expect(getActivationStatus('w1')).resolves.toEqual({
      workspaceCreated: true,
      projectCreated: true,
      taskCount: 3,
      invitationSent: false,
      secondMemberActive: false,
      coreViewOpened: true,
      checklistComplete: false,
      activatedWithin7Days: false,
      dismissed: false,
    })
    expect(rpc).toHaveBeenCalledWith('get_activation_status', { p_workspace_id: 'w1' })
  })

  it('records only the named server-validated signal', async () => {
    rpc.mockResolvedValue({ error: null })
    await recordActivationSignal('w1', 'workload_viewed')
    expect(rpc).toHaveBeenCalledWith('record_activation_signal', {
      p_workspace_id: 'w1',
      p_event_name: 'workload_viewed',
    })
  })

  it('pins dismissal to the signed-in user and workspace', async () => {
    upsert.mockResolvedValue({ error: null })
    await dismissOnboarding('w1', 'u1')
    expect(from).toHaveBeenCalledWith('onboarding_dismissals')
    expect(upsert).toHaveBeenCalledWith(
      { workspace_id: 'w1', user_id: 'u1' },
      { onConflict: 'workspace_id,user_id' },
    )
  })
})
