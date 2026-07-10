import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { Session } from '@supabase/supabase-js'

const { getSession, onAuthStateChange } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}))
vi.mock('../supabase', () => ({ supabase: { auth: { getSession, onAuthStateChange } } }))

import { SessionProvider, useSessionContext, useActorId } from './useSession'

const sessionFor = (uid: string) => ({ user: { id: uid } }) as unknown as Session

let authCb: (event: string, session: Session | null) => void

function Probe() {
  const { session, loading } = useSessionContext()
  return <div>{loading ? 'loading' : (session ? `uid:${session.user.id}` : 'signed-out')}</div>
}

function ActorProbe() {
  return <div>actor:{useActorId()}</div>
}

// Mirrors AuthGate: children render only once a session exists, which is the
// contract useActorId relies on.
function Gated({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSessionContext()
  if (loading || !session) return null
  return <>{children}</>
}

function mount(qc: QueryClient, children: React.ReactNode = <Probe />) {
  return render(
    <QueryClientProvider client={qc}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  onAuthStateChange.mockImplementation((cb: typeof authCb) => {
    authCb = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
})

describe('SessionProvider', () => {
  it('provides the resolved session through context', async () => {
    getSession.mockResolvedValue({ data: { session: sessionFor('alice') } })
    mount(new QueryClient())
    expect(await screen.findByText('uid:alice')).toBeInTheDocument()
  })

  it('keeps the query cache across the initial session resolution', async () => {
    getSession.mockResolvedValue({ data: { session: sessionFor('alice') } })
    const qc = new QueryClient()
    qc.setQueryData(['workspaces'], [{ id: 'w1' }])
    mount(qc)
    await screen.findByText('uid:alice')
    expect(qc.getQueryData(['workspaces'])).toEqual([{ id: 'w1' }])
  })

  it('clears the query cache when the signed-in user changes', async () => {
    getSession.mockResolvedValue({ data: { session: sessionFor('alice') } })
    const qc = new QueryClient()
    mount(qc)
    await screen.findByText('uid:alice')
    qc.setQueryData(['workspaces'], [{ id: 'w-alice' }])
    act(() => authCb('SIGNED_IN', sessionFor('bob')))
    await screen.findByText('uid:bob')
    await waitFor(() => expect(qc.getQueryData(['workspaces'])).toBeUndefined())
  })

  it('clears the query cache on sign-out', async () => {
    getSession.mockResolvedValue({ data: { session: sessionFor('alice') } })
    const qc = new QueryClient()
    mount(qc)
    await screen.findByText('uid:alice')
    qc.setQueryData(['tasks', 'w1'], [{ id: 't1' }])
    act(() => authCb('SIGNED_OUT', null))
    await screen.findByText('signed-out')
    await waitFor(() => expect(qc.getQueryData(['tasks', 'w1'])).toBeUndefined())
  })

  it('does not clear the cache on a token refresh for the same user', async () => {
    getSession.mockResolvedValue({ data: { session: sessionFor('alice') } })
    const qc = new QueryClient()
    mount(qc)
    await screen.findByText('uid:alice')
    qc.setQueryData(['workspaces'], [{ id: 'w1' }])
    act(() => authCb('TOKEN_REFRESHED', sessionFor('alice')))
    await screen.findByText('uid:alice')
    expect(qc.getQueryData(['workspaces'])).toEqual([{ id: 'w1' }])
  })
})

describe('useActorId', () => {
  it('returns the signed-in user id', async () => {
    getSession.mockResolvedValue({ data: { session: sessionFor('alice') } })
    mount(new QueryClient(), <Gated><ActorProbe /></Gated>)
    expect(await screen.findByText('actor:alice')).toBeInTheDocument()
  })
})
