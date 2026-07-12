import { useState, type FormEvent } from 'react'
import { useInvitations } from '../../lib/hooks/useInvitations'
import type { MemberRole } from './settingsPermissions'

function invitationState(invitation: {
  accepted_at: string | null
  revoked_at: string | null
  expires_at: string
}) {
  if (invitation.accepted_at) return 'Accepted'
  if (invitation.revoked_at) return 'Revoked'
  if (new Date(invitation.expires_at).getTime() <= Date.now()) return 'Expired'
  return 'Pending'
}

export function InvitationSettings({
  workspaceId,
  actorRole,
}: {
  workspaceId: string
  actorRole: MemberRole
}) {
  const { invitations, send, revoke } = useInvitations(workspaceId)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    send.mutate({ email, role }, { onSuccess: () => setEmail('') })
  }

  return (
    <section className="opm-settings-card" aria-labelledby="invitation-settings-title">
      <h2 id="invitation-settings-title" className="font-semibold text-[var(--text)]">
        Invitations
      </h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Invite teammates by email. Invitations expire after seven days.
      </p>
      <form onSubmit={submit} className="mt-4 flex max-w-2xl flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1 text-sm font-medium text-[var(--text)]">
          Email address
          <input
            className="opm-input mt-1"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="text-sm font-medium text-[var(--text)]">
          Role
          <select
            className="opm-select mt-1 block"
            value={role}
            onChange={(event) => setRole(event.target.value as 'admin' | 'member')}
          >
            <option value="member">Member</option>
            {actorRole === 'owner' && <option value="admin">Admin</option>}
          </select>
        </label>
        <button className="opm-btn-primary" disabled={send.isPending}>
          {send.isPending ? 'Sending…' : 'Send invitation'}
        </button>
      </form>

      {invitations.isLoading ? (
        <p className="mt-4 text-sm">Loading invitations…</p>
      ) : invitations.error ? (
        <div className="mt-4" role="alert">
          <p>Couldn’t load invitations.</p>
          <button className="opm-btn mt-2" onClick={() => invitations.refetch()}>
            Retry
          </button>
        </div>
      ) : invitations.data?.length ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="text-xs text-[var(--muted)]">
              <tr>
                <th className="pb-2">Email</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">State</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {invitations.data.map((invitation) => {
                const state = invitationState(invitation)
                const canAct = state === 'Pending' || state === 'Expired'
                return (
                  <tr key={invitation.id}>
                    <td className="py-3 pr-3 font-medium text-[var(--text)]">
                      {invitation.email_normalized}
                    </td>
                    <td className="py-3 pr-3 capitalize">{invitation.role}</td>
                    <td className="py-3 pr-3">{state}</td>
                    <td className="py-3 text-right">
                      {canAct && (
                        <div className="inline-flex gap-2">
                          <button
                            className="opm-btn"
                            disabled={send.isPending}
                            onClick={() =>
                              send.mutate({
                                email: invitation.email_normalized,
                                role: invitation.role as 'admin' | 'member',
                              })
                            }
                          >
                            Resend
                          </button>
                          {state === 'Pending' && (
                            <button
                              className="opm-btn"
                              disabled={revoke.isPending}
                              onClick={() => revoke.mutate(invitation.id)}
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--muted)]">No invitations yet.</p>
      )}
    </section>
  )
}
