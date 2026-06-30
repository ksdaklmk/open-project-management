import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listComments, addComment, type CommentItem } from '../../data/commentsRepo'
import { logComment } from '../../data/activityRepo'
import { useSession } from './useSession'

export function useComments(taskId: string) {
  return useQuery({ queryKey: ['comments', taskId], queryFn: () => listComments(taskId), enabled: !!taskId })
}

export function useAddComment(taskId: string, workspaceId: string) {
  const qc = useQueryClient()
  const { session } = useSession()
  const key = ['comments', taskId]
  return useMutation({
    mutationFn: async (body: string) => {
      const actorId = session?.user.id ?? ''
      await addComment(taskId, body, actorId)
      try {
        await logComment({ workspaceId, actorId, taskId })
      } catch (e) {
        toast.error(`Comment saved, but activity wasn't logged: ${(e as Error).message}`)
      }
    },
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<CommentItem[]>(key)
      const optimistic: CommentItem = {
        id: `tmp-${Date.now()}`, body, created_at: new Date().toISOString(), author: null,
      }
      qc.setQueryData<CommentItem[]>(key, (old) => [...(old ?? []), optimistic])
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error(`Couldn't post comment: ${(e as Error).message}`)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['activity', workspaceId] })
    },
  })
}
