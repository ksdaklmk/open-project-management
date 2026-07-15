import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repositories = vi.hoisted(() => ({
  listProjectTemplates: vi.fn(),
  captureProjectTemplate: vi.fn(),
  instantiateProjectTemplate: vi.fn(),
  deleteProjectTemplate: vi.fn(),
  getTaskRecurrence: vi.fn(),
  saveTaskRecurrence: vi.fn(),
  removeTaskRecurrence: vi.fn(),
}))

vi.mock('../../data/templatesRepo', () => ({
  listProjectTemplates: repositories.listProjectTemplates,
  captureProjectTemplate: repositories.captureProjectTemplate,
  instantiateProjectTemplate: repositories.instantiateProjectTemplate,
  deleteProjectTemplate: repositories.deleteProjectTemplate,
}))
vi.mock('../../data/recurrencesRepo', () => ({
  getTaskRecurrence: repositories.getTaskRecurrence,
  saveTaskRecurrence: repositories.saveTaskRecurrence,
  removeTaskRecurrence: repositories.removeTaskRecurrence,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { useProjectTemplates } from './useProjectTemplates'
import { useTaskRecurrence } from './useTaskRecurrence'

const wrap = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

beforeEach(() => {
  vi.clearAllMocks()
  repositories.listProjectTemplates.mockResolvedValue([{ id: 'tpl1', name: 'Launch' }])
  repositories.captureProjectTemplate.mockResolvedValue({ id: 'tpl1', name: 'Launch' })
  repositories.instantiateProjectTemplate.mockResolvedValue({
    projectId: 'p2',
    taskCount: 3,
    dependencyCount: 1,
  })
  repositories.deleteProjectTemplate.mockResolvedValue(undefined)
  repositories.getTaskRecurrence.mockResolvedValue(null)
  repositories.saveTaskRecurrence.mockResolvedValue({ id: 'r1' })
  repositories.removeTaskRecurrence.mockResolvedValue(undefined)
})

describe('template and recurrence hooks', () => {
  it('loads and mutates templates with workspace-scoped invalidation', async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useProjectTemplates('w1'), { wrapper: wrap(client) })
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'tpl1', name: 'Launch' }]))

    await act(() =>
      result.current.capture.mutateAsync({
        projectId: 'p1',
        name: 'Launch',
        description: '',
        anchorDate: '2026-07-14',
        capacityPerWeek: 40,
      }),
    )
    await act(() =>
      result.current.instantiate.mutateAsync({
        templateId: 'tpl1',
        projectName: 'Launch two',
        projectKey: 'LCH',
        anchorDate: '2026-08-01',
      }),
    )
    await act(() => result.current.remove.mutateAsync('tpl1'))

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project-templates', 'w1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects', 'w1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'w1'] })
  })

  it('loads, saves, and removes a task recurrence', async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useTaskRecurrence('t1', 'w1'), {
      wrapper: wrap(client),
    })
    await waitFor(() => expect(result.current.data).toBeNull())
    const input = {
      taskId: 't1',
      timezone: 'UTC',
      frequency: 'weekly' as const,
      interval: 1,
      firstOccurrenceLocal: '2026-07-20 09:00:00',
    }
    await act(() => result.current.save.mutateAsync(input))
    await act(() => result.current.remove.mutateAsync())

    expect(repositories.saveTaskRecurrence).toHaveBeenCalledWith(input, expect.anything())
    expect(repositories.removeTaskRecurrence).toHaveBeenCalledWith('t1')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['task-recurrence', 't1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'w1'] })
  })
})
