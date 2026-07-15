import { useMemo, useState } from 'react'
import type { Task } from '../../data/tasksRepo'

export const MAX_BULK_SELECTION = 500

export function useTaskSelection(workspaceId: string, tasks: Task[]) {
  const [selectedByWorkspace, setSelectedByWorkspace] = useState<Record<string, Set<string>>>(() =>
    Object.create(null),
  )
  const visibleIds = useMemo(() => tasks.map((task) => task.id), [tasks])
  const visibleKey = visibleIds.join(',')
  const selectedIds = useMemo(() => {
    const visible = new Set(visibleIds)
    return new Set([...(selectedByWorkspace[workspaceId] ?? [])].filter((id) => visible.has(id)))
    // The id signature captures visibility without depending on cache-equivalent arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedByWorkspace, workspaceId, visibleKey])

  const update = (change: (current: Set<string>) => Set<string>) => {
    setSelectedByWorkspace((current) => ({
      ...current,
      [workspaceId]: change(selectedIds),
    }))
  }

  const toggle = (taskId: string) => {
    update((current) => {
      const next = new Set(current)
      if (next.has(taskId)) next.delete(taskId)
      else if (next.size < MAX_BULK_SELECTION) next.add(taskId)
      return next
    })
  }

  const setMany = (taskIds: string[], selected: boolean) => {
    update((current) => {
      const next = new Set(current)
      if (selected) {
        for (const id of taskIds) {
          if (next.size >= MAX_BULK_SELECTION) break
          next.add(id)
        }
      } else {
        for (const id of taskIds) next.delete(id)
      }
      return next
    })
  }

  const clear = () => update(() => new Set())
  const isAllSelected = (taskIds: string[]) =>
    taskIds.length > 0 && taskIds.every((id) => selectedIds.has(id))

  return { selectedIds, toggle, setMany, clear, isAllSelected }
}
