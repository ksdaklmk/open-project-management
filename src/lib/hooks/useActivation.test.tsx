import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getActivationStatus, dismissOnboarding, recordActivationSignal } = vi.hoisted(() => ({
  getActivationStatus: vi.fn(),
  dismissOnboarding: vi.fn(),
  recordActivationSignal: vi.fn(),
}))

vi.mock('../../data/activationRepo', () => ({
  getActivationStatus,
  dismissOnboarding,
  recordActivationSignal,
}))
vi.mock('./useSession', () => ({ useActorId: () => 'u1' }))

import { useActivation, useActivationTracking } from './useActivation'

const wrap = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

describe('activation hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getActivationStatus.mockResolvedValue({ taskCount: 2, checklistComplete: false })
    dismissOnboarding.mockResolvedValue(undefined)
    recordActivationSignal.mockResolvedValue(undefined)
  })

  it('loads status and invalidates it after dismissal', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useActivation('w1'), { wrapper: wrap(client) })

    await waitFor(() =>
      expect(result.current.query.data).toEqual({
        taskCount: 2,
        checklistComplete: false,
      }),
    )
    await act(() => result.current.dismiss.mutateAsync())

    expect(dismissOnboarding).toHaveBeenCalledWith('w1', 'u1')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['activation', 'w1'] })
  })

  it('records member activity and planning-view transitions', async () => {
    const client = new QueryClient()
    const { rerender } = renderHook(({ view }) => useActivationTracking('w1', view), {
      initialProps: { view: 'list' },
      wrapper: wrap(client),
    })

    await waitFor(() => expect(recordActivationSignal).toHaveBeenCalledWith('w1', 'member_active'))
    rerender({ view: 'workload' })
    await waitFor(() =>
      expect(recordActivationSignal).toHaveBeenCalledWith('w1', 'workload_viewed'),
    )
    rerender({ view: 'gantt' })
    await waitFor(() => expect(recordActivationSignal).toHaveBeenCalledWith('w1', 'gantt_viewed'))
  })

  it('does not emit a signal without an active workspace', () => {
    renderHook(() => useActivationTracking('', 'list'), {
      wrapper: wrap(new QueryClient()),
    })
    expect(recordActivationSignal).not.toHaveBeenCalled()
  })
})
