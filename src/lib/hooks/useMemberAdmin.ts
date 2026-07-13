import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Database } from '../../types/database'
import {
  removeWorkspaceMember,
  setMemberCapacity,
  setMemberRole,
  transferWorkspaceOwnership,
} from '../../data/membersRepo'

type EditableRole = Exclude<Database['public']['Enums']['member_role'], 'owner'>

export function useMemberAdmin(workspaceId: string) {
  const queryClient = useQueryClient()
  const membersKey = ['members', workspaceId]
  const fail = (error: Error) => toast.error(error.message)
  const invalidateMembers = () => queryClient.invalidateQueries({ queryKey: membersKey })

  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: EditableRole }) =>
      setMemberRole(workspaceId, userId, role),
    onError: fail,
    onSuccess: invalidateMembers,
  })
  const setCapacity = useMutation({
    mutationFn: ({ userId, capacity }: { userId: string; capacity: number }) =>
      setMemberCapacity(workspaceId, userId, capacity),
    onError: fail,
    onSuccess: invalidateMembers,
  })
  const remove = useMutation({
    mutationFn: (userId: string) => removeWorkspaceMember(workspaceId, userId),
    onError: fail,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membersKey })
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
    },
  })
  const transferOwnership = useMutation({
    mutationFn: (newOwnerId: string) => transferWorkspaceOwnership(workspaceId, newOwnerId),
    onError: fail,
    onSuccess: invalidateMembers,
  })

  return { setRole, setCapacity, remove, transferOwnership }
}
