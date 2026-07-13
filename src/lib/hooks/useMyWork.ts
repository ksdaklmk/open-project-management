import { useInfiniteQuery } from '@tanstack/react-query'
import { queryMyWork, type MyWorkScope } from '../../data/myWorkRepo'

export function useMyWork(scope: MyWorkScope) {
  const query = useInfiniteQuery({
    queryKey: ['my-work', scope],
    initialPageParam: null as { sort: string; id: string } | null,
    queryFn: ({ pageParam, signal }) => queryMyWork(scope, pageParam, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  return {
    ...query,
    data: query.data?.pages.flatMap((page) => page.items) ?? [],
  }
}
