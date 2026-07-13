import { useActiveWorkspace } from '../../lib/workspace'
import { useViewState } from '../../app/useViewState'
import { LoadMoreButton } from '../../components/LoadMoreButton'
import { relativeTime } from '../../lib/relativeTime'
import {
  useInbox,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationPreferences,
  useUnreadNotifications,
} from '../../lib/hooks/useNotifications'
import type { NotificationItem, NotificationPreferences } from '../../data/notificationsRepo'

const MESSAGE: Record<NotificationItem['kind'], (taskRef: string | null) => string> = {
  assignment: (ref) => `You were assigned to ${ref ?? 'a task'}`,
  mention: (ref) => `You were mentioned on ${ref ?? 'a task'}`,
  watched_comment: (ref) => `New comment on watched task ${ref ?? ''}`.trim(),
  status_change: (ref) => `Status changed on ${ref ?? 'a task'}`,
  invitation: () => 'You were invited to a workspace',
  due_soon: (ref) => `${ref ?? 'A task'} is due soon`,
}

const PREFERENCE_OPTIONS: Array<
  [keyof Omit<NotificationPreferences, 'user_id' | 'email_enabled'>, string]
> = [
  ['assignments', 'Assignments'],
  ['mentions', 'Mentions'],
  ['watched_comments', 'Comments on watched tasks'],
  ['status_changes', 'Status changes on watched tasks'],
  ['invitations', 'Workspace invitations'],
  ['due_soon', 'Due-soon reminders'],
]

export function InboxView() {
  const query = useInbox()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const preferences = useNotificationPreferences()
  const unreadQuery = useUnreadNotifications()
  const { setActiveId } = useActiveWorkspace()
  const { setTaskRef } = useViewState()

  const open = (notification: NotificationItem) => {
    if (!notification.readAt) markRead.mutate(notification.id)
    if (notification.taskRef) {
      setActiveId(notification.workspaceId)
      setTaskRef(notification.taskRef)
    }
  }

  if (query.isLoading) return <p role="status">Loading your inbox…</p>
  if (query.error)
    return (
      <div role="alert" className="opm-state mx-auto max-w-xl py-12 text-center">
        <p className="font-semibold">Couldn’t load your inbox.</p>
        <button type="button" className="opm-btn mt-3" onClick={() => query.refetch()}>
          Retry
        </button>
      </div>
    )

  const unread =
    unreadQuery.data ?? query.data.filter((notification) => !notification.readAt).length
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section aria-labelledby="inbox-events-heading">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div>
            <p className="opm-kicker">Across all workspaces</p>
            <h2 id="inbox-events-heading" className="mt-1 text-base font-semibold">
              Notifications
            </h2>
          </div>
          <button
            type="button"
            className="opm-btn"
            disabled={unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            {markAll.isPending ? 'Marking…' : 'Mark all read'}
          </button>
        </div>
        {query.data.length === 0 ? (
          <div className="opm-state py-16 text-center">
            <p className="font-semibold">You’re all caught up</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Assignments, mentions, watched-task updates, and invitations will appear here.
            </p>
          </div>
        ) : (
          <ul className="mt-3 overflow-hidden rounded-md border border-[var(--border)] divide-y divide-[var(--border)]">
            {query.data.map((notification) => {
              const message = MESSAGE[notification.kind](notification.taskRef)
              return (
                <li
                  key={notification.id}
                  className="opm-row flex items-start gap-3 px-3 py-3"
                  data-unread={!notification.readAt || undefined}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      notification.readAt ? 'bg-[var(--border)]' : 'bg-[var(--accent)]'
                    }`}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => open(notification)}
                    aria-label={`${message}${notification.readAt ? '' : ', unread'}`}
                  >
                    <span className="block font-medium text-[var(--text)]">{message}</span>
                    <time className="mt-0.5 block text-xs text-[var(--muted)]">
                      {relativeTime(notification.createdAt)}
                    </time>
                  </button>
                  {!notification.readAt && (
                    <button
                      type="button"
                      className="opm-btn shrink-0"
                      disabled={markRead.isPending}
                      onClick={() => markRead.mutate(notification.id)}
                    >
                      Mark read
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {query.hasNextPage && (
          <LoadMoreButton
            label="Load older notifications"
            pending={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          />
        )}
      </section>
      <NotificationPreferencePanel preferences={preferences} />
    </div>
  )
}

function NotificationPreferencePanel({
  preferences,
}: {
  preferences: ReturnType<typeof useNotificationPreferences>
}) {
  return (
    <aside aria-labelledby="notification-preferences-heading">
      <h2 id="notification-preferences-heading" className="opm-section-title">
        Preferences
      </h2>
      {preferences.isLoading ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Loading preferences…</p>
      ) : preferences.error || !preferences.data ? (
        <div role="alert" className="mt-3 text-sm">
          <p>Couldn’t load preferences.</p>
          <button type="button" className="opm-btn mt-2" onClick={() => preferences.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <fieldset className="mt-3 space-y-3" disabled={preferences.update.isPending}>
          <legend className="sr-only">Notification types</legend>
          {PREFERENCE_OPTIONS.map(([key, label]) => (
            <label key={key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={preferences.data[key]}
                onChange={(event) => preferences.update.mutate({ [key]: event.target.checked })}
              />
              <span>{label}</span>
            </label>
          ))}
          <div className="border-t border-[var(--border)] pt-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={preferences.data.email_enabled}
                onChange={(event) =>
                  preferences.update.mutate({ email_enabled: event.target.checked })
                }
              />
              <span>
                Email notifications
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  Delivered asynchronously from the notification queue.
                </span>
              </span>
            </label>
          </div>
        </fieldset>
      )}
    </aside>
  )
}
