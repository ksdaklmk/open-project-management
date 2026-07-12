import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceRealtimeEvent, WorkspaceRealtimeStatus } from '../../data/realtimeRepo'

const realtime = vi.hoisted(() => ({
  activeId: 'w1' as string | null,
  userId: 'u1' as string | null,
  callbacks: [] as Array<{
    event: (event: WorkspaceRealtimeEvent) => void
    status: (status: WorkspaceRealtimeStatus) => void
    unsubscribe: ReturnType<typeof vi.fn>
  }>,
  subscribeToWorkspace: vi.fn(
    (
      _workspaceId: string,
      event: (event: WorkspaceRealtimeEvent) => void,
      status: (status: WorkspaceRealtimeStatus) => void,
    ) => {
      const unsubscribe = vi.fn()
      realtime.callbacks.push({ event, status, unsubscribe })
      return unsubscribe
    },
  ),
}))
vi.mock('../../data/realtimeRepo', () => ({
  subscribeToWorkspace: realtime.subscribeToWorkspace,
}))
vi.mock('../workspace', () => ({
  useActiveWorkspace: () => ({ activeId: realtime.activeId }),
}))
vi.mock('../hooks/useSession', () => ({
  useSessionContext: () => ({
    session: realtime.userId ? { user: { id: realtime.userId } } : null,
  }),
}))

import { useRealtimeConnectionState, WorkspaceRealtimeProvider } from './WorkspaceRealtimeProvider'

function Probe() {
  return <span>state:{useRealtimeConnectionState()}</span>
}

function mount(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceRealtimeProvider>
        <Probe />
      </WorkspaceRealtimeProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  realtime.callbacks = []
  realtime.activeId = 'w1'
  realtime.userId = 'u1'
})

afterEach(() => vi.useRealTimers())

describe('WorkspaceRealtimeProvider', () => {
  it('waits until both workspace and session are known', () => {
    realtime.activeId = null
    mount(new QueryClient())
    expect(screen.getByText('state:idle')).toBeInTheDocument()
    expect(realtime.subscribeToWorkspace).not.toHaveBeenCalled()
  })

  it('debounces and deduplicates events into narrow invalidations', async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    mount(client)
    expect(screen.getByText('state:connecting')).toBeInTheDocument()
    act(() => realtime.callbacks[0].status('SUBSCRIBED'))
    expect(screen.getByText('state:connected')).toBeInTheDocument()
    const event: WorkspaceRealtimeEvent = {
      table: 'tasks',
      eventType: 'UPDATE',
      new: { id: 't1', workspace_id: 'w1' },
      old: {},
      commitTimestamp: 'same-commit',
    }
    act(() => {
      realtime.callbacks[0].event(event)
      realtime.callbacks[0].event(event)
      vi.advanceTimersByTime(75)
    })
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'w1'] })
  })

  it('shows reconnecting and closes missed-event gaps after resubscribe', () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    mount(client)
    act(() => realtime.callbacks[0].status('SUBSCRIBED'))
    invalidate.mockClear()
    act(() => realtime.callbacks[0].status('CHANNEL_ERROR'))
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting…')
    act(() => realtime.callbacks[0].status('SUBSCRIBED'))
    expect(screen.queryByText('Reconnecting…')).toBeNull()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'w1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['members', 'w1'] })
  })

  it('unsubscribes and creates a fresh scoped channel on workspace change', () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const view = mount(client)
    const first = realtime.callbacks[0]
    realtime.activeId = 'w2'
    view.rerender(
      <QueryClientProvider client={client}>
        <WorkspaceRealtimeProvider>
          <Probe />
        </WorkspaceRealtimeProvider>
      </QueryClientProvider>,
    )
    expect(first.unsubscribe).toHaveBeenCalled()
    expect(realtime.subscribeToWorkspace).toHaveBeenLastCalledWith(
      'w2',
      expect.any(Function),
      expect.any(Function),
    )

    act(() => {
      first.event({
        table: 'tasks',
        eventType: 'UPDATE',
        new: { id: 't1', workspace_id: 'w1' },
        old: {},
      })
      vi.advanceTimersByTime(75)
    })
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['tasks', 'w1'] })
  })
})
