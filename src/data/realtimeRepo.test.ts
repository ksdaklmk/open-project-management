import { beforeEach, describe, expect, it, vi } from 'vitest'

const { on, subscribe, channel, removeChannel } = vi.hoisted(() => {
  const on = vi.fn().mockReturnThis()
  const subscribe = vi.fn()
  const realtimeChannel = { on, subscribe }
  return {
    on,
    subscribe,
    channel: vi.fn(() => realtimeChannel),
    removeChannel: vi.fn(),
  }
})
vi.mock('../lib/supabase', () => ({ supabase: { channel, removeChannel } }))

import { subscribeToWorkspace } from './realtimeRepo'

beforeEach(() => vi.clearAllMocks())

describe('subscribeToWorkspace', () => {
  it('scopes workspace tables and subscribes child tables through RLS', () => {
    subscribeToWorkspace('w1', vi.fn(), vi.fn())
    expect(channel).toHaveBeenCalledWith('workspace:w1')
    expect(on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'tasks', filter: 'workspace_id=eq.w1' }),
      expect.any(Function),
    )
    expect(on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'comments' },
      expect.any(Function),
    )
    expect(on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      expect.any(Function),
    )
    expect(on).toHaveBeenCalledTimes(10)
    expect(subscribe).toHaveBeenCalledOnce()
  })

  it('removes its channel on cleanup', () => {
    const cleanup = subscribeToWorkspace('w1', vi.fn(), vi.fn())
    cleanup()
    expect(removeChannel).toHaveBeenCalledWith(channel.mock.results[0].value)
  })
})
