import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  applyBulkTaskAction,
  preflightBulkTaskAction,
  undoBulkTaskAction,
  type BulkTaskAction,
  type BulkTaskPreflight,
} from '../../data/tasksRepo'

const BATCH_SIZE = 100

export interface BulkTaskRunResult {
  operationId: string
  totalCount: number
  processedCount: number
  changedCount: number
  unchangedCount: number
  skippedCount: number
  failedCount: number
  undoableUntil: string | null
  complete: boolean
}

export class BulkTaskPartialFailure extends Error {
  constructor(
    readonly result: BulkTaskRunResult,
    cause: unknown,
  ) {
    super(
      `${result.processedCount} of ${result.totalCount} tasks were processed. ` +
        `The failed batch was rolled back: ${(cause as Error).message}`,
    )
    this.name = 'BulkTaskPartialFailure'
  }
}

function newOperationId() {
  return crypto.randomUUID()
}

export function useBulkTasks(workspaceId: string) {
  const queryClient = useQueryClient()
  const [progress, setProgress] = useState<BulkTaskRunResult | null>(null)
  const [lastResult, setLastResult] = useState<BulkTaskRunResult | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
    queryClient.invalidateQueries({ queryKey: ['task', workspaceId] })
    queryClient.invalidateQueries({ queryKey: ['workload', workspaceId] })
    queryClient.invalidateQueries({ queryKey: ['activity', workspaceId] })
    queryClient.invalidateQueries({ queryKey: ['my-work'] })
  }

  const preflight = useMutation({
    mutationFn: ({ taskIds, action }: { taskIds: string[]; action: BulkTaskAction }) =>
      preflightBulkTaskAction(workspaceId, taskIds, action),
    onError: (error) => toast.error(`Couldn't review bulk action: ${(error as Error).message}`),
  })

  const apply = useMutation({
    mutationFn: async ({ taskIds, action }: { taskIds: string[]; action: BulkTaskAction }) => {
      const operationId = newOperationId()
      let state: BulkTaskRunResult = {
        operationId,
        totalCount: taskIds.length,
        processedCount: 0,
        changedCount: 0,
        unchangedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        undoableUntil: null,
        complete: false,
      }
      setLastResult(null)
      setProgress(state)

      for (let start = 0; start < taskIds.length; start += BATCH_SIZE) {
        const batch = taskIds.slice(start, start + BATCH_SIZE)
        try {
          const result = await applyBulkTaskAction(operationId, workspaceId, batch, action)
          state = {
            ...state,
            processedCount: state.processedCount + result.requestedCount,
            changedCount: state.changedCount + result.changedCount,
            unchangedCount: state.unchangedCount + result.unchangedCount,
            skippedCount: state.skippedCount + result.skippedCount,
            undoableUntil: result.undoableUntil,
          }
          setProgress(state)
        } catch (error) {
          state = {
            ...state,
            failedCount: state.totalCount - state.processedCount,
            complete: false,
          }
          setProgress(null)
          setLastResult(state)
          throw new BulkTaskPartialFailure(state, error)
        }
      }

      state = { ...state, complete: true }
      setProgress(null)
      setLastResult(state)
      return state
    },
    onSuccess: (result) => toast.success(`${result.changedCount} tasks updated.`),
    onError: (error) => toast.error((error as Error).message),
    onSettled: invalidate,
  })

  const undo = useMutation({
    mutationFn: (operationId: string) => undoBulkTaskAction(operationId),
    onSuccess: (result) => {
      setLastResult(null)
      const skipped = result.conflictCount + result.missingCount
      if (skipped) {
        toast.warning(
          `${result.restoredCount} tasks restored; ${skipped} skipped because newer work was found.`,
        )
      } else {
        toast.success(`${result.restoredCount} tasks restored.`)
      }
    },
    onError: (error) => toast.error(`Couldn't undo bulk action: ${(error as Error).message}`),
    onSettled: invalidate,
  })

  const clearResult = () => setLastResult(null)

  return { preflight, apply, undo, progress, lastResult, clearResult }
}

export type { BulkTaskAction, BulkTaskPreflight }
