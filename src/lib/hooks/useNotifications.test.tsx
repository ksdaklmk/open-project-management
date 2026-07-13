import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repo = vi.hoisted(() => ({
  queryInbox: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
  isTaskWatched: vi.fn(),
  setTaskWatched: vi.fn(),
}))
vi.mock('../../data/notificationsRepo', () => repo)
vi.mock('./useSession', () => ({ useActorId: () => 'u1' }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import {
  useInbox,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationPreferences,
  useTaskWatch,
  useUnreadNotifications,
} from './useNotifications'

const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children)
  }

const client = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

const preferences = {
  user_id: 'u1',
  assignments: true,
  mentions: true,
  watched_comments: true,
  status_changes: true,
  invitations: true,
  due_soon: true,
  email_enabled: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  repo.queryInbox.mockResolvedValue({
    items: [{ id: 'n1' }],
    nextCursor: null,
  })
  repo.getUnreadNotificationCount.mockResolvedValue(2)
  repo.markNotificationRead.mockResolvedValue(undefined)
  repo.markAllNotificationsRead.mockResolvedValue(2)
  repo.getNotificationPreferences.mockResolvedValue(preferences)
  repo.updateNotificationPreferences.mockResolvedValue({ ...preferences, mentions: false })
  repo.isTaskWatched.mockResolvedValue(false)
  repo.setTaskWatched.mockResolvedValue(true)
})

describe('notification hooks', () => {
  it('loads and flattens the personal Inbox page', async () => {
    const queryClient = client()
    const { result } = renderHook(useInbox, { wrapper: wrapper(queryClient) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ id: 'n1' }])
    expect(repo.queryInbox).toHaveBeenCalledWith(null, expect.any(AbortSignal))
  })

  it('loads the unread badge count', async () => {
    const { result } = renderHook(useUnreadNotifications, { wrapper: wrapper(client()) })
    await waitFor(() => expect(result.current.data).toBe(2))
  })

  it('marks one notification read and invalidates Inbox families', async () => {
    const queryClient = client()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(useMarkNotificationRead, { wrapper: wrapper(queryClient) })
    result.current.mutate('n1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(repo.markNotificationRead).toHaveBeenCalledWith('n1', 'u1')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notification-unread'] })
  })

  it('marks every visible notification read', async () => {
    const queryClient = client()
    const { result } = renderHook(useMarkAllNotificationsRead, {
      wrapper: wrapper(queryClient),
    })
    result.current.mutate()
    await waitFor(() => expect(result.current.data).toBe(2))
    expect(repo.markAllNotificationsRead).toHaveBeenCalledOnce()
  })

  it('loads and updates preference cache for the signed-in user', async () => {
    const queryClient = client()
    const { result } = renderHook(useNotificationPreferences, {
      wrapper: wrapper(queryClient),
    })
    await waitFor(() => expect(result.current.data).toEqual(preferences))
    result.current.update.mutate({ mentions: false })
    await waitFor(() => expect(result.current.update.isSuccess).toBe(true))
    expect(repo.updateNotificationPreferences).toHaveBeenCalledWith('u1', { mentions: false })
    expect(queryClient.getQueryData(['notification-preferences', 'u1'])).toMatchObject({
      mentions: false,
    })
  })

  it('loads and toggles a task watch in its narrow cache', async () => {
    const queryClient = client()
    const { result } = renderHook(() => useTaskWatch('t1'), { wrapper: wrapper(queryClient) })
    await waitFor(() => expect(result.current.data).toBe(false))
    result.current.toggle.mutate(true)
    await waitFor(() => expect(result.current.toggle.isSuccess).toBe(true))
    expect(repo.setTaskWatched).toHaveBeenCalledWith('t1', true)
    expect(queryClient.getQueryData(['task-watch', 't1'])).toBe(true)
  })
})
