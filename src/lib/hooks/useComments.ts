import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  listCommentsPage,
  addComment,
  type CommentCursor,
  type CommentItem,
  type CommentPage,
} from '../../data/commentsRepo'

export interface NewCommentInput {
  body: string
  mentionedUserIds?: string[]
}

const normalizeInput = (input: string | NewCommentInput): NewCommentInput =>
  typeof input === 'string' ? { body: input, mentionedUserIds: [] } : input

export function useComments(taskId: string) {
  const query = useInfiniteQuery({
    queryKey: ['comments', taskId],
    queryFn: ({ pageParam, signal }) => listCommentsPage(taskId, pageParam, signal),
    initialPageParam: null as CommentCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!taskId,
  })
  const newestFirst = query.data?.pages.flatMap((page) => page.items) ?? []
  return { ...query, data: [...newestFirst].reverse() }
}

export function useAddComment(taskId: string, workspaceId: string) {
  const qc = useQueryClient()
  const key = ['comments', taskId]
  return useMutation({
    mutationFn: (input: string | NewCommentInput) => {
      const comment = normalizeInput(input)
      return addComment(taskId, comment.body, comment.mentionedUserIds ?? [])
    },
    onMutate: async (input) => {
      const { body } = normalizeInput(input)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<InfiniteData<CommentPage, CommentCursor | null>>(key)
      const optimistic: CommentItem = {
        id: `tmp-${Date.now()}`,
        body,
        created_at: new Date().toISOString(),
        author: null,
      }
      qc.setQueryData<InfiniteData<CommentPage, CommentCursor | null>>(key, (old) => {
        if (!old?.pages.length) {
          return { pages: [{ items: [optimistic], nextCursor: null }], pageParams: [null] }
        }
        return {
          ...old,
          pages: [
            { ...old.pages[0], items: [optimistic, ...old.pages[0].items] },
            ...old.pages.slice(1),
          ],
        }
      })
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error(`Couldn't post comment: ${(e as Error).message}`)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['activity', workspaceId] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notification-unread'] })
    },
  })
}
