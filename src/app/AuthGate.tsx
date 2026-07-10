import type { ReactNode } from 'react'
import { useSessionContext } from '../lib/hooks/useSession'
import { LoginPage } from './LoginPage'

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSessionContext()
  if (loading) return <div className="min-h-full grid place-items-center text-[var(--muted)]">Loading…</div>
  if (!session) return <LoginPage />
  return <>{children}</>
}
