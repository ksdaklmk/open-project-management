import { useState } from 'react'
import { useMembers } from '../../lib/hooks/useMembers'
import { useTasks } from '../../lib/hooks/useTasks'
import { useMemberAdmin } from '../../lib/hooks/useMemberAdmin'
import { canRemoveMember, type MemberRole } from './settingsPermissions'

export function MemberSettings({
  workspaceId,
  actorId,
  actorRole,
}: {
  workspaceId: string
  actorId: string
  actorRole: MemberRole
}) {
  const members = useMembers(workspaceId)
  const tasks = useTasks(workspaceId)
  const admin = useMemberAdmin(workspaceId)
  const [removing, setRemoving] = useState<string | null>(null)
  const [newOwner, setNewOwner] = useState('')
  const [confirmTransfer, setConfirmTransfer] = useState(false)
  const candidates = members.data?.filter((member) => member.user_id !== actorId) ?? []
  const assignmentsUnavailable = tasks.isLoading || !!tasks.error

  if (members.isLoading)
    return (
      <section className="opm-settings-card">
        <p>Loading members…</p>
      </section>
    )
  if (members.error)
    return (
      <section className="opm-settings-card" role="alert">
        <p>Couldn’t load members.</p>
        <button className="opm-btn mt-2" onClick={() => members.refetch()}>
          Retry
        </button>
      </section>
    )
  if (!members.data?.length)
    return (
      <section className="opm-settings-card">
        <h2 className="font-semibold text-[var(--text)]">Members</h2>
        <p className="mt-1 text-sm">No members found.</p>
      </section>
    )

  return (
    <section className="opm-settings-card" aria-labelledby="member-settings-title">
      <div>
        <h2 id="member-settings-title" className="font-semibold text-[var(--text)]">
          Members
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Manage roles and weekly capacity.</p>
      </div>
      {tasks.error && (
        <div className="mt-4" role="alert">
          <p>Couldn’t load assignment counts. Member removal is unavailable.</p>
          <button className="opm-btn mt-2" onClick={() => tasks.refetch()}>
            Retry
          </button>
        </div>
      )}
      {tasks.isLoading && <p className="mt-4 text-sm">Loading assignment counts…</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-xs text-[var(--muted)]">
            <tr>
              <th className="pb-2">Member</th>
              <th className="pb-2">Role</th>
              <th className="pb-2">Capacity / week</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {members.data?.map((member) => {
              const assigned =
                tasks.data?.filter((task) => task.assignee_id === member.user_id).length ?? 0
              const canRemove = canRemoveMember(actorRole, member.role)
              return (
                <tr key={member.user_id}>
                  <td className="py-3 pr-3">
                    <span className="font-medium text-[var(--text)]">
                      {member.name.trim() || 'Someone'}
                    </span>
                    {member.user_id === actorId && (
                      <span className="ml-2 text-xs text-[var(--muted)]">You</span>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    <label className="sr-only" htmlFor={`role-${member.user_id}`}>
                      Role for {member.name || 'member'}
                    </label>
                    <select
                      id={`role-${member.user_id}`}
                      className="opm-select"
                      value={member.role}
                      disabled={
                        actorRole !== 'owner' || member.role === 'owner' || admin.setRole.isPending
                      }
                      onChange={(e) =>
                        admin.setRole.mutate({
                          userId: member.user_id,
                          role: e.target.value as 'admin' | 'member',
                        })
                      }
                    >
                      <option value="owner" disabled>
                        Owner
                      </option>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  </td>
                  <td className="py-3 pr-3">
                    <label className="sr-only" htmlFor={`capacity-${member.user_id}`}>
                      Weekly capacity for {member.name || 'member'}
                    </label>
                    <input
                      id={`capacity-${member.user_id}`}
                      className="opm-input w-24"
                      type="number"
                      min="0"
                      max="168"
                      defaultValue={member.capacity_per_week}
                      disabled={admin.setCapacity.isPending}
                      onBlur={(e) => {
                        const capacity = Number(e.target.value)
                        if (capacity === member.capacity_per_week) return
                        admin.setCapacity.mutate({
                          userId: member.user_id,
                          capacity,
                        })
                      }}
                    />
                  </td>
                  <td className="py-3 text-right">
                    {removing === member.user_id ? (
                      <div
                        className="inline-flex items-center gap-2"
                        role="group"
                        aria-label={`Confirm remove ${member.name || 'member'}`}
                      >
                        <span>
                          {assigned} task{assigned === 1 ? '' : 's'} will become unassigned.
                        </span>
                        <button autoFocus className="opm-btn" onClick={() => setRemoving(null)}>
                          Cancel
                        </button>
                        <button
                          className="opm-btn"
                          disabled={admin.remove.isPending}
                          onClick={() =>
                            admin.remove.mutate(member.user_id, {
                              onSuccess: () => setRemoving(null),
                            })
                          }
                        >
                          {admin.remove.isPending ? 'Removing…' : 'Confirm remove'}
                        </button>
                      </div>
                    ) : (
                      <button
                        className="opm-btn"
                        disabled={!canRemove || assignmentsUnavailable}
                        title={
                          !canRemove
                            ? 'Only an owner can remove an owner.'
                            : assignmentsUnavailable
                              ? 'Wait for assignment counts to load.'
                              : undefined
                        }
                        onClick={() => setRemoving(member.user_id)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {actorRole === 'owner' && (
        <div className="mt-6 border-t border-[var(--border)] pt-4">
          <h3 className="font-medium text-[var(--text)]">Transfer ownership</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            You will become an admin after the transfer.
          </p>
          {confirmTransfer ? (
            <div
              className="mt-3 flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Confirm ownership transfer"
            >
              <span className="text-sm">Transfer ownership now?</span>
              <button autoFocus className="opm-btn" onClick={() => setConfirmTransfer(false)}>
                Cancel
              </button>
              <button
                className="opm-btn-primary"
                disabled={admin.transferOwnership.isPending}
                onClick={() =>
                  admin.transferOwnership.mutate(newOwner, {
                    onSuccess: () => setConfirmTransfer(false),
                  })
                }
              >
                {admin.transferOwnership.isPending ? 'Transferring…' : 'Confirm transfer'}
              </button>
            </div>
          ) : (
            <div className="mt-3 flex max-w-lg gap-2">
              <label className="sr-only" htmlFor="new-owner">
                New owner
              </label>
              <select
                id="new-owner"
                className="opm-select"
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
              >
                <option value="">Select a member</option>
                {candidates.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.name.trim() || 'Someone'} — {member.role}
                  </option>
                ))}
              </select>
              <button
                className="opm-btn"
                disabled={!newOwner}
                onClick={() => setConfirmTransfer(true)}
              >
                Transfer ownership
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
