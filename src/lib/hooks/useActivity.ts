import { useInfiniteQuery } from '@tanstack/react-query'
import { listActivityPage, type ActivityCursor } from '../../data/activityRepo'

export function useActivity(workspaceId: string) {
  const query = useInfiniteQuery({
    queryKey: ['activity', workspaceId],
    queryFn: ({ pageParam, signal }) => listActivityPage(workspaceId, pageParam, signal),
    initialPageParam: null as ActivityCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!workspaceId,
  })
  return { ...query, data: query.data?.pages.flatMap((page) => page.items) }
}
