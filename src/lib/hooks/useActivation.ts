import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  dismissOnboarding,
  getActivationStatus,
  recordActivationSignal,
  type ActivationSignal,
} from '../../data/activationRepo'
import { useActorId } from './useSession'

export const activationQueryKey = (workspaceId: string) => ['activation', workspaceId]

export function useActivation(workspaceId: string, enabled = true) {
  const actorId = useActorId()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: activationQueryKey(workspaceId),
    queryFn: () => getActivationStatus(workspaceId),
    enabled: enabled && !!workspaceId,
    staleTime: 30_000,
  })
  const dismiss = useMutation({
    mutationFn: () => dismissOnboarding(workspaceId, actorId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: activationQueryKey(workspaceId) }),
  })
  return { query, dismiss }
}

export function useActivationTracking(workspaceId: string, view: string) {
  const queryClient = useQueryClient()
  const signal = useMutation({
    mutationFn: (eventName: ActivationSignal) => recordActivationSignal(workspaceId, eventName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: activationQueryKey(workspaceId) }),
  })

  useEffect(() => {
    if (!workspaceId) return
    const eventName: ActivationSignal =
      view === 'workload' ? 'workload_viewed' : view === 'gantt' ? 'gantt_viewed' : 'member_active'
    signal.mutate(eventName)
    // The mutation is idempotent at the database unique index. Tracking is
    // intentionally keyed only by workspace/view transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, view])
}
