import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { createTask, logCreate } = vi.hoisted(() => ({ createTask: vi.fn(), logCreate: vi.fn() }))
vi.mock('../../data/tasksRepo', () => ({ createTask }))
vi.mock('../../data/activityRepo', () => ({ logCreate }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('./useSession', () => ({ useSession: () => ({ session: { user: { id: 'u1' } } }) }))

import { useCreateTask } from './useCreateTask'
import { toast } from 'sonner'

const ws = 'w1'
const project = { id: 'p1', name: 'Nimbus', key: 'NIM' }
const wrap = (qc: QueryClient) => ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: qc }, children)

beforeEach(() => vi.clearAllMocks())

describe('useCreateTask', () => {
  it('creates with the session uid pinned, logs activity, and invalidates both caches', async () => {
    const qc = new QueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    createTask.mockResolvedValueOnce({ id: 't9', ref: 'NIM-107', tags: [] })
    logCreate.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useCreateTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ title: 'New thing', project })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(createTask).toHaveBeenCalledWith({
      workspaceId: ws, projectId: 'p1', projectKey: 'NIM',
      title: 'New thing', createdBy: 'u1',
    })
    expect(logCreate).toHaveBeenCalledWith({ workspaceId: ws, actorId: 'u1', taskId: 't9' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', ws] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['activity', ws] })
  })

  it('keeps the created task when logCreate rejects — toasts, still succeeds', async () => {
    const qc = new QueryClient()
    createTask.mockResolvedValueOnce({ id: 't9', ref: 'NIM-107', tags: [] })
    logCreate.mockRejectedValueOnce(new Error('activity down'))
    const { result } = renderHook(() => useCreateTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ title: 'New thing', project })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("wasn't logged"))
  })

  it('toasts on create failure', async () => {
    const qc = new QueryClient()
    createTask.mockRejectedValueOnce(new Error('nope'))
    const { result } = renderHook(() => useCreateTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ title: 'New thing', project })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('nope'))
    expect(logCreate).not.toHaveBeenCalled()
  })
})
