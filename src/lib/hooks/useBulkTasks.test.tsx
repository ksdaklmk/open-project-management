import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { preflightBulkTaskAction, applyBulkTaskAction, undoBulkTaskAction } = vi.hoisted(() => ({
  preflightBulkTaskAction: vi.fn(),
  applyBulkTaskAction: vi.fn(),
  undoBulkTaskAction: vi.fn(),
}))

vi.mock('../../data/tasksRepo', () => ({
  preflightBulkTaskAction,
  applyBulkTaskAction,
  undoBulkTaskAction,
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { BulkTaskPartialFailure, useBulkTasks } from './useBulkTasks'

const wrap = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

beforeEach(() => vi.clearAllMocks())

describe('useBulkTasks', () => {
  it('runs sequential atomic batches and aggregates progress', async () => {
    applyBulkTaskAction.mockImplementation(
      async (operationId: string, _workspaceId: string, taskIds: string[]) => ({
        operationId,
        requestedCount: taskIds.length,
        changedCount: taskIds.length,
        unchangedCount: 0,
        skippedCount: 0,
        undoableUntil: '2026-07-14T12:05:00Z',
      }),
    )
    const client = new QueryClient()
    const { result } = renderHook(() => useBulkTasks('w1'), { wrapper: wrap(client) })
    const taskIds = Array.from({ length: 205 }, (_, index) => `t${index}`)

    await act(() =>
      result.current.apply.mutateAsync({
        taskIds,
        action: { kind: 'priority', value: 'high' },
      }),
    )

    expect(applyBulkTaskAction).toHaveBeenCalledTimes(3)
    expect(applyBulkTaskAction.mock.calls.map((call) => call[2].length)).toEqual([100, 100, 5])
    expect(result.current.lastResult).toEqual(
      expect.objectContaining({
        totalCount: 205,
        processedCount: 205,
        changedCount: 205,
        failedCount: 0,
        complete: true,
      }),
    )
  })

  it('reports completed batches and leaves a failed batch rolled back', async () => {
    applyBulkTaskAction
      .mockImplementationOnce(
        async (operationId: string, _workspaceId: string, taskIds: string[]) => ({
          operationId,
          requestedCount: taskIds.length,
          changedCount: taskIds.length,
          unchangedCount: 0,
          skippedCount: 0,
          undoableUntil: '2026-07-14T12:05:00Z',
        }),
      )
      .mockRejectedValueOnce(new Error('network lost'))
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const { result } = renderHook(() => useBulkTasks('w1'), { wrapper: wrap(client) })
    const taskIds = Array.from({ length: 150 }, (_, index) => `t${index}`)

    let caught: unknown
    await act(async () => {
      try {
        await result.current.apply.mutateAsync({ taskIds, action: { kind: 'archive' } })
      } catch (error) {
        caught = error
      }
    })
    expect(caught).toBeInstanceOf(BulkTaskPartialFailure)

    await waitFor(() =>
      expect(result.current.lastResult).toEqual(
        expect.objectContaining({
          processedCount: 100,
          changedCount: 100,
          failedCount: 50,
          complete: false,
        }),
      ),
    )
  })

  it('routes preflight and conflict-safe undo', async () => {
    preflightBulkTaskAction.mockResolvedValueOnce({
      requestedCount: 1,
      willChangeCount: 1,
      unchangedCount: 0,
      skippedCount: 0,
    })
    undoBulkTaskAction.mockResolvedValueOnce({
      restoredCount: 1,
      conflictCount: 0,
      missingCount: 0,
    })
    const client = new QueryClient()
    const { result } = renderHook(() => useBulkTasks('w1'), { wrapper: wrap(client) })

    await act(() =>
      result.current.preflight.mutateAsync({
        taskIds: ['t1'],
        action: { kind: 'assignee', value: null },
      }),
    )
    await act(() => result.current.undo.mutateAsync('op1'))

    expect(preflightBulkTaskAction).toHaveBeenCalledWith('w1', ['t1'], {
      kind: 'assignee',
      value: null,
    })
    expect(undoBulkTaskAction).toHaveBeenCalledWith('op1')
  })
})
