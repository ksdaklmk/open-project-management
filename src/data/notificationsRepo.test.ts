import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getUnreadNotificationCount,
  INBOX_PAGE_SIZE,
  isTaskWatched,
  markAllNotificationsRead,
  markNotificationRead,
  queryInbox,
  setTaskWatched,
  getNotificationPreferences,
  updateNotificationPreferences,
} from './notificationsRepo'

const { rpc, abortSignal, from, upsert, maybeSingle, single } = vi.hoisted(() => ({
  rpc: vi.fn(),
  abortSignal: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ supabase: { rpc, from } }))

beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockImplementation((name: string) =>
    name === 'query_inbox'
      ? { abortSignal }
      : Promise.resolve({ data: name === 'get_unread_notification_count' ? 4 : true, error: null }),
  )
  from.mockImplementation((table: string) =>
    table === 'notification_preferences'
      ? {
          select: () => ({ eq: () => ({ maybeSingle }) }),
          upsert: (...args: unknown[]) => {
            upsert(...args)
            return { select: () => ({ single }) }
          },
        }
      : { upsert },
  )
  upsert.mockResolvedValue({ error: null })
  maybeSingle.mockResolvedValue({ data: null, error: null })
  single.mockResolvedValue({
    data: {
      user_id: 'u1',
      assignments: true,
      mentions: false,
      watched_comments: true,
      status_changes: true,
      invitations: true,
      due_soon: true,
      email_enabled: false,
    },
    error: null,
  })
})

describe('notificationsRepo', () => {
  it('maps a bounded Inbox page and stable cursor', async () => {
    const rows = Array.from({ length: INBOX_PAGE_SIZE + 1 }, (_, index) => ({
      id: `n${index}`,
      workspace_id: 'w1',
      actor_id: index ? 'u2' : null,
      kind: index ? 'mention' : 'invitation',
      task_id: index ? 't1' : null,
      task_ref: index ? 'PRJ-101' : null,
      comment_id: index ? 'c1' : null,
      invitation_id: index ? null : 'i1',
      created_at: `2026-07-13T00:00:${String(index).padStart(2, '0')}Z`,
      read_at: index ? null : '2026-07-13T01:00:00Z',
    }))
    abortSignal.mockResolvedValue({ data: rows, error: null })

    const page = await queryInbox()
    expect(page.items).toHaveLength(INBOX_PAGE_SIZE)
    expect(page.items[0]).toMatchObject({
      workspaceId: 'w1',
      invitationId: 'i1',
      readAt: expect.any(String),
    })
    expect(page.nextCursor).toEqual({
      id: 'n49',
      createdAt: '2026-07-13T00:00:49Z',
    })
    expect(rpc).toHaveBeenCalledWith('query_inbox', {
      p_cursor_created_at: undefined,
      p_cursor_id: undefined,
      p_limit: 50,
    })
  })

  it('passes the compound Inbox cursor', async () => {
    abortSignal.mockResolvedValue({ data: [], error: null })
    await queryInbox({ createdAt: 'time', id: 'n1' })
    expect(rpc).toHaveBeenCalledWith(
      'query_inbox',
      expect.objectContaining({ p_cursor_created_at: 'time', p_cursor_id: 'n1' }),
    )
  })

  it('reads unread count and marks one or all events read', async () => {
    expect(await getUnreadNotificationCount()).toBe(4)
    await markNotificationRead('n1', 'u1')
    expect(from).toHaveBeenCalledWith('notification_reads')
    expect(upsert).toHaveBeenCalledWith(
      { notification_id: 'n1', user_id: 'u1' },
      expect.objectContaining({ ignoreDuplicates: true }),
    )
    expect(await markAllNotificationsRead()).toBe(true)
    expect(rpc).toHaveBeenCalledWith('mark_all_notifications_read')
  })

  it('reads and changes the current user watch state through RPCs', async () => {
    expect(await isTaskWatched('t1')).toBe(true)
    expect(await setTaskWatched('t1', false)).toBe(true)
    expect(rpc).toHaveBeenCalledWith('is_task_watched', { p_task_id: 't1' })
    expect(rpc).toHaveBeenCalledWith('set_task_watched', {
      p_task_id: 't1',
      p_watching: false,
    })
  })

  it('uses safe defaults until preferences exist, then upserts a narrow patch', async () => {
    expect(await getNotificationPreferences('u1')).toMatchObject({
      user_id: 'u1',
      assignments: true,
      email_enabled: false,
    })
    expect(await updateNotificationPreferences('u1', { mentions: false })).toMatchObject({
      mentions: false,
    })
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'u1', mentions: false },
      { onConflict: 'user_id' },
    )
  })
})
