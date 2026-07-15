import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repositories = vi.hoisted(() => ({
  listProjectMilestones: vi.fn(),
  createProjectMilestone: vi.fn(),
  updateProjectMilestone: vi.fn(),
  deleteProjectMilestone: vi.fn(),
  listTaskDependencies: vi.fn(),
  listTaskDependencyEdges: vi.fn(),
  createTaskDependency: vi.fn(),
  deleteTaskDependency: vi.fn(),
  queryTasks: vi.fn(),
}))

vi.mock('../../data/milestonesRepo', () => ({
  listProjectMilestones: repositories.listProjectMilestones,
  createProjectMilestone: repositories.createProjectMilestone,
  updateProjectMilestone: repositories.updateProjectMilestone,
  deleteProjectMilestone: repositories.deleteProjectMilestone,
}))
vi.mock('../../data/dependenciesRepo', () => ({
  listTaskDependencies: repositories.listTaskDependencies,
  listTaskDependencyEdges: repositories.listTaskDependencyEdges,
  createTaskDependency: repositories.createTaskDependency,
  deleteTaskDependency: repositories.deleteTaskDependency,
}))
vi.mock('../../data/tasksRepo', () => ({ queryTasks: repositories.queryTasks }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { useMilestoneMutations, useMilestones } from './useMilestones'
import {
  useDependencyCandidates,
  useTaskDependencies,
  useTaskDependencyEdges,
  useTaskDependencyMutations,
} from './useTaskDependencies'

const wrap = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

beforeEach(() => {
  vi.clearAllMocks()
  repositories.listProjectMilestones.mockResolvedValue([{ id: 'm1', title: 'Beta' }])
  repositories.createProjectMilestone.mockResolvedValue({ id: 'm2' })
  repositories.updateProjectMilestone.mockResolvedValue({ id: 'm1' })
  repositories.deleteProjectMilestone.mockResolvedValue(undefined)
  repositories.listTaskDependencies.mockResolvedValue([{ id: 'd1' }])
  repositories.listTaskDependencyEdges.mockResolvedValue([{ id: 'd1' }])
  repositories.createTaskDependency.mockResolvedValue(undefined)
  repositories.deleteTaskDependency.mockResolvedValue(undefined)
  repositories.queryTasks.mockResolvedValue({
    items: [{ id: 't1', ref: 'NIM-1', title: 'Foundation' }],
    nextCursor: null,
  })
})

describe('milestone and dependency hooks', () => {
  it('loads and mutates milestones with narrow workspace invalidation', async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(
      () => ({ query: useMilestones('w1'), mutations: useMilestoneMutations('w1') }),
      { wrapper: wrap(client) },
    )
    await waitFor(() => expect(result.current.query.data).toEqual([{ id: 'm1', title: 'Beta' }]))

    await act(() =>
      result.current.mutations.create.mutateAsync({
        projectId: 'p1',
        title: 'GA',
        targetDate: '2026-08-01',
        status: 'planned',
      }),
    )
    await act(() =>
      result.current.mutations.update.mutateAsync({
        milestoneId: 'm1',
        title: 'GA',
        targetDate: '2026-08-02',
        status: 'complete',
      }),
    )
    await act(() => result.current.mutations.remove.mutateAsync('m1'))

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['milestones', 'w1'] })
    expect(repositories.createProjectMilestone).toHaveBeenCalledOnce()
    expect(repositories.updateProjectMilestone).toHaveBeenCalledOnce()
    expect(repositories.deleteProjectMilestone.mock.calls[0][0]).toBe('m1')
  })

  it('loads dependencies/candidates and invalidates task and graph caches after edits', async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(
      () => ({
        dependencies: useTaskDependencies('w1', 't2'),
        edges: useTaskDependencyEdges('w1', ['t1', 't2']),
        candidates: useDependencyCandidates('w1', 'Foundation'),
        mutations: useTaskDependencyMutations('w1'),
      }),
      { wrapper: wrap(client) },
    )
    await waitFor(() => expect(result.current.dependencies.data).toEqual([{ id: 'd1' }]))
    await waitFor(() => expect(result.current.edges.data).toEqual([{ id: 'd1' }]))
    await waitFor(() => expect(result.current.candidates.data?.[0].id).toBe('t1'))

    await act(() =>
      result.current.mutations.create.mutateAsync({
        predecessorTaskId: 't1',
        successorTaskId: 't2',
      }),
    )
    await act(() => result.current.mutations.remove.mutateAsync('d1'))

    expect(repositories.listTaskDependencies).toHaveBeenCalledWith('w1', 't2')
    expect(repositories.queryTasks).toHaveBeenCalledWith({
      workspaceId: 'w1',
      search: 'Foundation',
      sort: 'title',
      limit: 100,
    })
    expect(repositories.listTaskDependencyEdges).toHaveBeenCalledWith('w1', ['t1', 't2'])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dependencies', 'w1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', 'w1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['task', 'w1'] })
  })
})
