import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repos = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  archiveProject: vi.fn(),
  setMemberRole: vi.fn(),
  setMemberCapacity: vi.fn(),
  removeWorkspaceMember: vi.fn(),
  transferWorkspaceOwnership: vi.fn(),
}))
vi.mock('../../data/workspacesRepo', () => ({
  createWorkspace: repos.createWorkspace,
  updateWorkspace: repos.updateWorkspace,
}))
vi.mock('../../data/projectsRepo', () => ({
  createProject: repos.createProject,
  updateProject: repos.updateProject,
  archiveProject: repos.archiveProject,
}))
vi.mock('../../data/membersRepo', () => ({
  setMemberRole: repos.setMemberRole,
  setMemberCapacity: repos.setMemberCapacity,
  removeWorkspaceMember: repos.removeWorkspaceMember,
  transferWorkspaceOwnership: repos.transferWorkspaceOwnership,
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { toast } from 'sonner'
import { useMemberAdmin } from './useMemberAdmin'
import { useProjectAdmin } from './useProjectAdmin'
import { useCreateWorkspace, useUpdateWorkspace } from './useWorkspaceAdmin'

const workspaceId = 'w1'
const wrap = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }

beforeEach(() => vi.clearAllMocks())

describe('workspace administration hooks', () => {
  it('invalidates the workspace list after create and update', async () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    repos.createWorkspace.mockResolvedValueOnce({ workspaceId: 'w2', projectId: 'p2' })
    repos.updateWorkspace.mockResolvedValueOnce({ id: workspaceId })
    const create = renderHook(() => useCreateWorkspace(), { wrapper: wrap(queryClient) })
    create.result.current.mutate({
      name: 'Acme',
      initialProjectName: 'Delivery',
      initialProjectKey: 'DEL',
    })
    await waitFor(() => expect(create.result.current.isSuccess).toBe(true))
    const update = renderHook(() => useUpdateWorkspace(), { wrapper: wrap(queryClient) })
    update.result.current.mutate({ workspaceId, name: 'Renamed' })
    await waitFor(() => expect(update.result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workspaces'] })
  })
})

describe('project administration hook', () => {
  it('invalidates projects and tasks after archival', async () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    repos.archiveProject.mockResolvedValueOnce({ id: 'p1' })
    const { result } = renderHook(() => useProjectAdmin(workspaceId), {
      wrapper: wrap(queryClient),
    })
    result.current.archive.mutate('p1')
    await waitFor(() => expect(result.current.archive.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects', workspaceId] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', workspaceId] })
  })
})

describe('member administration hook', () => {
  it('waits for removal success, then invalidates members and tasks', async () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const setData = vi.spyOn(queryClient, 'setQueryData')
    repos.removeWorkspaceMember.mockResolvedValueOnce({ removedUserId: 'u2' })
    const { result } = renderHook(() => useMemberAdmin(workspaceId), {
      wrapper: wrap(queryClient),
    })
    result.current.remove.mutate('u2')
    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true))
    expect(setData).not.toHaveBeenCalled()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['members', workspaceId] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', workspaceId] })
  })

  it('surfaces actionable repository errors', async () => {
    const queryClient = new QueryClient()
    repos.setMemberRole.mockRejectedValueOnce(
      new Error('Transfer ownership before removing or demoting the final owner.'),
    )
    const { result } = renderHook(() => useMemberAdmin(workspaceId), {
      wrapper: wrap(queryClient),
    })
    result.current.setRole.mutate({ userId: 'u1', role: 'member' })
    await waitFor(() => expect(result.current.setRole.isError).toBe(true))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Transfer ownership'))
  })
})
