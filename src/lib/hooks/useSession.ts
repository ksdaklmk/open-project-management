import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'

interface SessionState {
  session: Session | null
  loading: boolean
}

export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  return { session, loading }
}

const Ctx = createContext<SessionState | null>(null)

// One session owner for the whole app: a single auth subscription feeding
// context, and the query cache dropped whenever the signed-in identity
// changes, so cached tenant data can never survive an account switch or
// sign-out (docs/AUDIT.md findings 1-2). Token refreshes keep the same user
// id and do not clear.
export function SessionProvider({ children }: { children: ReactNode }) {
  const state = useSession()
  const qc = useQueryClient()
  const prevUid = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (state.loading) return
    const uid = state.session?.user.id ?? null
    if (prevUid.current !== undefined && prevUid.current !== uid) qc.clear()
    prevUid.current = uid
  }, [state.loading, state.session, qc])

  return createElement(Ctx.Provider, { value: state }, children)
}

export function useSessionContext(): SessionState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSessionContext must be used within SessionProvider')
  return ctx
}

// Mutations must never run with a missing actor (docs/AUDIT.md finding 2).
// Beneath AuthGate a session always exists, so throwing here flags a
// programmer error (hook used outside the authed tree), not a runtime race.
export function useActorId(): string {
  const { session } = useSessionContext()
  if (!session) throw new Error('useActorId requires a signed-in session')
  return session.user.id
}

// Carve-out file: the only non-data module allowed to touch supabase.auth.
export function signOut() {
  return supabase.auth.signOut()
}
