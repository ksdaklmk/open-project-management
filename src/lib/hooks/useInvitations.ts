import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  acceptMyInvitations,
  listInvitations,
  revokeInvitation,
  sendInvitation,
  type InvitationRole,
} from '../../data/invitationsRepo'

export function useInvitationAcceptance(actorId: string) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['invitation-acceptance', actorId],
    queryFn: async () => {
      const count = await acceptMyInvitations()
      if (count > 0) await queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      return count
    },
    retry: 1,
    staleTime: Infinity,
  })
}

export function useInvitations(workspaceId: string) {
  const queryClient = useQueryClient()
  const queryKey = ['invitations', workspaceId]
  const invitations = useQuery({
    queryKey,
    queryFn: () => listInvitations(workspaceId),
    enabled: !!workspaceId,
  })
  const fail = (error: Error) => toast.error(error.message)
  const refresh = () => queryClient.invalidateQueries({ queryKey })
  const refreshActivation = () =>
    queryClient.invalidateQueries({ queryKey: ['activation', workspaceId] })
  const send = useMutation({
    mutationFn: ({ email, role }: { email: string; role: InvitationRole }) =>
      sendInvitation(workspaceId, email, role),
    onError: fail,
    onSuccess: (result) => {
      toast.success(result.message)
      refresh()
      refreshActivation()
    },
  })
  const revoke = useMutation({
    mutationFn: revokeInvitation,
    onError: fail,
    onSuccess: refresh,
  })
  return { invitations, send, revoke }
}
