import type { ReactNode } from 'react'
import { useSession } from '../lib/hooks/useSession'
import { LoginPage } from './LoginPage'

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSession()
  if (loading) return <div className="min-h-full grid place-items-center text-[var(--muted)]">Loading…</div>
  if (!session) return <LoginPage />
  return <>{children}</>
}
