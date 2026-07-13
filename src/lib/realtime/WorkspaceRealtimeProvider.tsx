import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import {
  subscribeToWorkspace,
  type WorkspaceRealtimeEvent,
  type WorkspaceRealtimeStatus,
} from '../../data/realtimeRepo'
import { useSessionContext } from '../hooks/useSession'
import { useActiveWorkspace } from '../workspace'
import { allWorkspaceQueryKeys, eventFingerprint, eventQueryKeys } from './eventMapping'
import { recordTelemetry } from '../observability'

export type RealtimeConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting'
const RealtimeContext = createContext<RealtimeConnectionState>('idle')

export function useRealtimeConnectionState() {
  return useContext(RealtimeContext)
}

export function WorkspaceRealtimeProvider({ children }: { children: ReactNode }) {
  const { activeId } = useActiveWorkspace()
  const { session } = useSessionContext()
  const queryClient = useQueryClient()
  const userId = session?.user.id
  const scope = activeId && userId ? `${userId}:${activeId}` : null
  const [connection, setConnection] = useState<{
    scope: string
    state: Exclude<RealtimeConnectionState, 'idle'>
  } | null>(null)
  const state: RealtimeConnectionState = !scope
    ? 'idle'
    : connection?.scope === scope
      ? connection.state
      : 'connecting'
  const connectedOnce = useRef(false)

  useEffect(() => {
    if (!activeId || !userId || !scope) return

    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const pending = new Map<string, QueryKey>()
    const recent = new Map<string, number>()
    connectedOnce.current = false

    const flush = () => {
      timer = undefined
      for (const key of pending.values()) void queryClient.invalidateQueries({ queryKey: key })
      pending.clear()
    }
    const schedule = (event: WorkspaceRealtimeEvent) => {
      if (stopped) return
      const now = Date.now()
      const fingerprint = eventFingerprint(event)
      if ((recent.get(fingerprint) ?? 0) > now - 2000) return
      recent.set(fingerprint, now)
      for (const [key, seenAt] of recent) if (seenAt <= now - 2000) recent.delete(key)
      for (const key of eventQueryKeys(event, activeId, queryClient)) {
        pending.set(JSON.stringify(key), key)
      }
      if (pending.size && !timer) timer = setTimeout(flush, 75)
    }
    const invalidateAfterReconnect = () => {
      for (const key of allWorkspaceQueryKeys(queryClient, activeId)) {
        void queryClient.invalidateQueries({ queryKey: key })
      }
    }
    const statusChanged = (status: WorkspaceRealtimeStatus) => {
      if (stopped) return
      if (status === 'SUBSCRIBED') {
        if (connectedOnce.current) {
          invalidateAfterReconnect()
          recordTelemetry('realtime_connection', { status: 'connected', reconnect: true })
        }
        connectedOnce.current = true
        setConnection({ scope, state: 'connected' })
      } else {
        recordTelemetry('realtime_connection', { status: 'reconnecting', reconnect: true })
        setConnection({ scope, state: 'reconnecting' })
      }
    }

    const unsubscribe = subscribeToWorkspace(activeId, schedule, statusChanged)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      pending.clear()
      recent.clear()
      unsubscribe()
    }
  }, [activeId, userId, scope, queryClient])

  return (
    <RealtimeContext.Provider value={state}>
      {children}
      {state === 'reconnecting' && (
        <div
          role="status"
          className="fixed bottom-3 right-3 z-50 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--muted)] shadow-sm"
        >
          Reconnecting…
        </div>
      )}
    </RealtimeContext.Provider>
  )
}
