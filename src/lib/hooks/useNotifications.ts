import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getNotificationPreferences,
  getUnreadNotificationCount,
  isTaskWatched,
  markAllNotificationsRead,
  markNotificationRead,
  queryInbox,
  setTaskWatched,
  updateNotificationPreferences,
  type NotificationCursor,
  type NotificationPreferences,
} from '../../data/notificationsRepo'
import { useActorId } from './useSession'

const invalidateInbox = (queryClient: ReturnType<typeof useQueryClient>) => {
  void queryClient.invalidateQueries({ queryKey: ['notifications'] })
  void queryClient.invalidateQueries({ queryKey: ['notification-unread'] })
}

export function useInbox() {
  const query = useInfiniteQuery({
    queryKey: ['notifications', 'inbox'],
    initialPageParam: null as NotificationCursor | null,
    queryFn: ({ pageParam, signal }) => queryInbox(pageParam, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  return { ...query, data: query.data?.pages.flatMap((page) => page.items) ?? [] }
}

export function useUnreadNotifications() {
  return useQuery({
    queryKey: ['notification-unread'],
    queryFn: getUnreadNotificationCount,
    refetchInterval: 30_000,
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  const userId = useActorId()
  return useMutation({
    mutationKey: ['notification-read'],
    mutationFn: (notificationId: string) => markNotificationRead(notificationId, userId),
    onSuccess: () => invalidateInbox(queryClient),
    onError: (error) => toast.error(`Couldn't mark notification read: ${(error as Error).message}`),
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['notification-read-all'],
    mutationFn: markAllNotificationsRead,
    onSuccess: () => invalidateInbox(queryClient),
    onError: (error) =>
      toast.error(`Couldn't mark notifications read: ${(error as Error).message}`),
  })
}

export function useNotificationPreferences() {
  const queryClient = useQueryClient()
  const userId = useActorId()
  const query = useQuery({
    queryKey: ['notification-preferences', userId],
    queryFn: () => getNotificationPreferences(userId),
  })
  const update = useMutation({
    mutationKey: ['notification-preferences-update'],
    mutationFn: (patch: Partial<Omit<NotificationPreferences, 'user_id'>>) =>
      updateNotificationPreferences(userId, patch),
    onSuccess: (preferences) => {
      queryClient.setQueryData(['notification-preferences', userId], preferences)
    },
    onError: (error) =>
      toast.error(`Couldn't save notification preferences: ${(error as Error).message}`),
  })
  return { ...query, update }
}

export function useTaskWatch(taskId: string) {
  const queryClient = useQueryClient()
  const queryKey = ['task-watch', taskId]
  const query = useQuery({
    queryKey,
    queryFn: () => isTaskWatched(taskId),
    enabled: !!taskId,
  })
  const toggle = useMutation({
    mutationKey: ['task-watch-toggle'],
    mutationFn: (watching: boolean) => setTaskWatched(taskId, watching),
    onSuccess: (watching) => queryClient.setQueryData(queryKey, watching),
    onError: (error) => toast.error(`Couldn't update watch state: ${(error as Error).message}`),
  })
  return { ...query, toggle }
}
