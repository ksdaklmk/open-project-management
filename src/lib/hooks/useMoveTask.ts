import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { moveTask, TaskMoveConflict, type Task } from '../../data/tasksRepo'
import { cachedTasks, patchTaskCaches, restoreTaskCaches, snapshotTaskCaches } from '../taskCache'

interface MoveArgs {
  taskId: string
  toStatus: Task['status']
  position: number
  fromStatus: Task['status']
  beforeTaskId?: string | null
  afterTaskId?: string | null
}

export function refreshedMoveNeighbours(tasks: Task[], args: MoveArgs) {
  const target = tasks
    .filter((task) => task.id !== args.taskId && task.status === args.toStatus)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
  const beforeIndex = args.beforeTaskId
    ? target.findIndex((task) => task.id === args.beforeTaskId)
    : -1
  if (beforeIndex >= 0) {
    return {
      beforeTaskId: target[beforeIndex].id,
      afterTaskId: target[beforeIndex + 1]?.id ?? null,
    }
  }
  const afterIndex = args.afterTaskId
    ? target.findIndex((task) => task.id === args.afterTaskId)
    : -1
  if (afterIndex >= 0) {
    return {
      beforeTaskId: target[afterIndex - 1]?.id ?? null,
      afterTaskId: target[afterIndex].id,
    }
  }
  return { beforeTaskId: null, afterTaskId: target[0]?.id ?? null }
}

export function useMoveTask(workspaceId: string) {
  const qc = useQueryClient()
  const key = ['tasks', workspaceId]
  return useMutation({
    mutationFn: async (args: MoveArgs) => {
      const initialNeighbours =
        args.beforeTaskId === undefined && args.afterTaskId === undefined
          ? refreshedMoveNeighbours(cachedTasks(qc, workspaceId), args)
          : {
              beforeTaskId: args.beforeTaskId ?? null,
              afterTaskId: args.afterTaskId ?? null,
            }
      try {
        await moveTask(
          args.taskId,
          args.toStatus,
          initialNeighbours.beforeTaskId,
          initialNeighbours.afterTaskId,
        )
      } catch (error) {
        if (!(error instanceof TaskMoveConflict)) throw error
        await qc.invalidateQueries({ queryKey: key })
        const refreshed = cachedTasks(qc, workspaceId)
        const neighbours = refreshedMoveNeighbours(refreshed, args)
        await moveTask(args.taskId, args.toStatus, neighbours.beforeTaskId, neighbours.afterTaskId)
      }
    },
    onMutate: async ({ taskId, toStatus, position }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = snapshotTaskCaches(qc, workspaceId)
      patchTaskCaches(qc, workspaceId, (task) =>
        task.id === taskId ? { ...task, status: toStatus, position } : task,
      )
      return { prev }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) restoreTaskCaches(qc, ctx.prev)
      toast.error(`Move failed: ${(err as Error).message}`)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['task', workspaceId] })
      qc.invalidateQueries({ queryKey: ['workload', workspaceId] })
      qc.invalidateQueries({ queryKey: ['activity', workspaceId] })
      qc.invalidateQueries({ queryKey: ['my-work'] })
    },
  })
}
