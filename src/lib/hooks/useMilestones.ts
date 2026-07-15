import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createProjectMilestone,
  deleteProjectMilestone,
  listProjectMilestones,
  updateProjectMilestone,
} from '../../data/milestonesRepo'

export function useMilestones(workspaceId: string) {
  return useQuery({
    queryKey: ['milestones', workspaceId],
    queryFn: () => listProjectMilestones(workspaceId),
    enabled: !!workspaceId,
  })
}

export function useMilestoneMutations(workspaceId: string) {
  const queryClient = useQueryClient()
  const fail = (error: Error) => toast.error(error.message)
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['milestones', workspaceId] })

  const create = useMutation({
    mutationFn: createProjectMilestone,
    onError: fail,
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: updateProjectMilestone,
    onError: fail,
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: deleteProjectMilestone,
    onError: fail,
    onSuccess: invalidate,
  })
  return { create, update, remove }
}
